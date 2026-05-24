import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SarahLetter, SarahLetterType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  GenerateWeeklyInternalDto,
  PatchSarahLetterDto,
  SarahLetterDto,
} from './dto/sarah-letter.dto';
import {
  SarahCozeClient,
  SarahCozeConfigurationError,
  SarahCozeParseError,
} from './sarah-coze.client';

const WELCOME_LETTER_CONTENT = `亲爱的你，

欢迎来到 Sarah Tab。

从今天开始，我会在这里陪你慢慢整理那些被记录下来的时刻。你不需要表现得更好，也不需要把每一天都解释清楚；只要把真实的片段放在这里，我们就可以一起看见它们之间温柔的线索。

每封 Sarah Letter 都会尽量轻一点、真一点。它不会评价你，只会帮你把最近的感受、需要和变化重新递回到你手里。

很高兴见到你。

Sarah`;

@Injectable()
export class SarahService {
  private readonly logger = new Logger(SarahService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coze: SarahCozeClient,
  ) {}

  // ─── 客户端读取接口 ───────────────────────────────────────────────────────────

  async list(userId: string) {
    const letters = await this.prisma.sarahLetter.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return { letters: letters.map((letter) => this.toPayload(letter)) };
  }

  async welcome(userId: string) {
    const existing = await this.findByDedupe(userId, 'welcome');
    if (existing) return { letter: this.toPayload(existing) };

    const letter = await this.createOrReturnExisting(userId, 'welcome', {
      userId,
      type: 'welcome',
      dedupeKey: 'welcome',
      content: WELCOME_LETTER_CONTENT,
      previewText: this.previewText(WELCOME_LETTER_CONTENT),
      illustrationIndex: this.randomIllustrationIndex(),
      isRead: false,
      deletedAt: null,
    });

    return { letter: this.toPayload(letter) };
  }

  async migrateLegacy(userId: string, letters: SarahLetterDto[]) {
    const migrated = new Map<string, SarahLetter>();

    for (const letter of letters) {
      const sourceLegacyReportId = this.nullableString(letter.sourceLegacyReportId);
      const weekStart = this.optionalDate(letter.weekStart);
      const weekEnd = this.optionalDate(letter.weekEnd);
      const dedupeKey = this.legacyDedupeKey(letter, weekStart, weekEnd, sourceLegacyReportId);
      const existing = await this.findByDedupe(userId, dedupeKey);

      if (existing) {
        const visible = existing.deletedAt
          ? await this.prisma.sarahLetter.update({
              where: { id: existing.id },
              data: { deletedAt: null },
            })
          : existing;
        migrated.set(visible.id, visible);
        continue;
      }

      const created = await this.createOrReturnExisting(userId, dedupeKey, {
        userId,
        type: 'legacy',
        dedupeKey,
        weekStart,
        weekEnd,
        content: letter.content,
        previewText: letter.previewText || this.previewText(letter.content),
        illustrationIndex: this.safeIllustrationIndex(letter.illustrationIndex),
        isRead: letter.isRead,
        sourceLegacyReportId,
        deletedAt: this.optionalDate(letter.deletedAt),
        createdAt: new Date(letter.createdAt),
        updatedAt: new Date(letter.updatedAt),
      });
      migrated.set(created.id, created);
    }

    const uniqueLetters = Array.from(migrated.values()).sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );
    return { letters: uniqueLetters.map((letter) => this.toPayload(letter)) };
  }

  async delete(userId: string, id: string) {
    const letter = await this.prisma.sarahLetter.findFirst({
      where: { id, userId },
    });

    if (!letter) {
      throw new NotFoundException('Letter not found');
    }

    if (!letter.deletedAt) {
      await this.prisma.sarahLetter.update({
        where: { id: letter.id },
        data: { deletedAt: new Date() },
      });
    }
  }

  async patch(userId: string, id: string, dto: PatchSarahLetterDto) {
    const existing = await this.prisma.sarahLetter.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Sarah letter not found');
    }

    const letter = await this.prisma.sarahLetter.update({
      where: { id: existing.id },
      data: { isRead: dto.isRead },
    });
    return { letter: this.toPayload(letter) };
  }

  // ─── 内部接口（管理员 / Cron 使用）────────────────────────────────────────────

  /**
   * 内部接口：为指定用户补发指定周的周报。
   * 由 SarahController 的内部端点或 SarahSchedulerService 调用。
   *
   * @returns 生成结果：'generated' | 'skipped_existing' | 'skipped_no_records' | 'failed'
   */
  async generateWeeklyForUser(
    userId: string,
    weekStart: Date,
    weekEnd: Date,
  ): Promise<'generated' | 'skipped_existing' | 'skipped_no_records'> {
    // 幂等校验：按 weekStart 查找任意已存在的周报（含已软删除），避免重复生成
    // 用 weekStart 而不是 dedupeKey，是因为旧客户端触发的信件 dedupeKey 格式不同，
    // 统一用 weekStart 可以覆盖所有情况。
    const existing = await this.prisma.sarahLetter.findFirst({
      where: { userId, type: 'weekly', weekStart },
    });
    if (existing) return 'skipped_existing';

    // 拉取本周有效记录（包含 weekEnd 时刻）
    const records = await this.prisma.record.findMany({
      where: {
        userId,
        deletedAt: null,
        createdAtClient: { gte: weekStart, lte: weekEnd },
      } as any,
      orderBy: { createdAtClient: 'asc' },
    });

    const usableRecords = records
      .map((r) => ({
        record_time: this.iso(r.createdAtClient) ?? new Date(0).toISOString(),
        content: String(r.transcription ?? '').trim(),
      }))
      .filter((r) => r.content);

    if (usableRecords.length === 0) return 'skipped_no_records';

    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    // dedupeKey 只用 weekStart，保证同一周期只能有一条（不受 weekEnd 毫秒差影响）
    const dedupeKey = this.weeklyDedupeKey(weekStart);

    const parts = await this.coze.generateWeeklyLetter({
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      records: usableRecords,
    });

    const content = this.composeLetter(profile?.nickname ?? null, parts.summary, parts.signature);
    await this.createOrReturnExisting(userId, dedupeKey, {
      userId,
      type: 'weekly',
      dedupeKey,
      weekStart,
      weekEnd,
      content,
      previewText: this.previewText(content),
      illustrationIndex: this.randomIllustrationIndex(),
      isRead: false,
      deletedAt: null,
    });

    return 'generated';
  }

  /**
   * 内部接口：Controller 层调用入口，含参数校验和错误降级。
   * 异常不向外抛出，统一以 { letter: null } 返回。
   */
  async generateWeeklyInternal(dto: GenerateWeeklyInternalDto) {
    const weekStart = new Date(dto.weekStart);
    const weekEnd = new Date(dto.weekEnd);
    if (Number.isNaN(weekStart.getTime()) || Number.isNaN(weekEnd.getTime()) || weekStart >= weekEnd) {
      throw new BadRequestException('Invalid week range');
    }

    try {
      const result = await this.generateWeeklyForUser(dto.userId, weekStart, weekEnd);
      if (result === 'generated') {
        const letter = await this.prisma.sarahLetter.findFirst({
          where: { userId: dto.userId, type: 'weekly', weekStart },
        });
        return { result, letter: letter ? this.toPayload(letter) : null };
      }
      return { result, letter: null };
    } catch (error) {
      if (error instanceof SarahCozeConfigurationError || error instanceof SarahCozeParseError) {
        this.logger.warn(`Sarah weekly generate-internal no-op: ${this.errorMessage(error)}`);
      } else {
        this.logger.error(`Sarah weekly generate-internal failed: ${this.errorMessage(error)}`);
      }
      return { result: 'failed', letter: null };
    }
  }

  // ─── 私有工具方法 ─────────────────────────────────────────────────────────────

  private async createOrReturnExisting(userId: string, dedupeKey: string, data: any): Promise<SarahLetter> {
    try {
      return await this.prisma.sarahLetter.create({ data });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const existing = await this.findByDedupe(userId, dedupeKey);
        if (existing) return existing;
      }
      throw error;
    }
  }

  private async findByDedupe(userId: string, dedupeKey: string): Promise<SarahLetter | null> {
    return this.prisma.sarahLetter.findFirst({
      where: { userId, dedupeKey },
    });
  }

  private composeLetter(nickname: string | null, summary: string, signature: string): string {
    const name = nickname?.trim() ? nickname.trim() : '你';
    return `亲爱的${name}，\n\n${summary.trim()}\n\n${signature.trim()}`;
  }

  private previewText(content: string): string {
    const normalized = content.replace(/\s+/g, ' ').trim();
    const match = normalized.match(/^(.+?[。！？.!?])(?:\s|$)/);
    return (match?.[1] ?? normalized).slice(0, 120);
  }

  private randomIllustrationIndex(): number {
    return Math.floor(Math.random() * 20) + 1;
  }

  private safeIllustrationIndex(value: number): number {
    return Number.isInteger(value) && value >= 1 && value <= 20 ? value : this.randomIllustrationIndex();
  }

  private legacyDedupeKey(
    letter: SarahLetterDto,
    weekStart: Date | null,
    weekEnd: Date | null,
    sourceLegacyReportId: string | null,
  ): string {
    if (sourceLegacyReportId) return `legacy:source:${sourceLegacyReportId}`;
    if (weekStart && weekEnd) return `legacy:week:${weekStart.toISOString()}:${weekEnd.toISOString()}`;
    return `legacy:id:${letter.id}`;
  }

  /**
   * 新格式：只用 weekStart，保证 Cron 每次执行结果一致（不受 weekEnd 毫秒差影响）。
   * 旧格式 `weekly:${weekStart}:${weekEnd}` 仍留在历史数据中，
   * 幂等校验通过 weekStart 字段查询，不依赖 dedupeKey 格式，因此两者不冲突。
   */
  private weeklyDedupeKey(weekStart: Date): string {
    return `weekly:${weekStart.toISOString()}`;
  }

  private optionalDate(value?: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private nullableString(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private toPayload(letter: SarahLetter) {
    return {
      id: letter.id,
      userId: letter.userId,
      accountId: letter.userId,
      type: this.letterType(letter.type),
      createdAt: this.iso(letter.createdAt),
      weekStart: this.iso(letter.weekStart),
      weekEnd: this.iso(letter.weekEnd),
      content: letter.content,
      previewText: letter.previewText,
      illustrationIndex: letter.illustrationIndex,
      isRead: letter.isRead,
      updatedAt: this.iso(letter.updatedAt),
      sourceLegacyReportId: letter.sourceLegacyReportId ?? null,
      deletedAt: this.iso(letter.deletedAt),
    };
  }

  private letterType(value: SarahLetterType): 'weekly' | 'welcome' | 'legacy' {
    return value === 'weekly' || value === 'welcome' || value === 'legacy' ? value : 'legacy';
  }

  private iso(value?: Date | string | null): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private isUniqueConflict(error: unknown): boolean {
    return !!error && typeof error === 'object' && (error as { code?: string }).code === 'P2002';
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
