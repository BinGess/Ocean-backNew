import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SarahService } from './sarah.service';

const CST_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

@Injectable()
export class SarahSchedulerService {
  private readonly logger = new Logger(SarahSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sarahService: SarahService,
  ) {}

  /**
   * 每周日 20:00 CST 自动为所有活跃用户生成本周 Sarah 信件。
   * Cron 表达式 `0 20 * * 0` 配合 timeZone 'Asia/Shanghai'，
   * 等价于 UTC 每周日 12:00。
   */
  @Cron('0 20 * * 0', { timeZone: 'Asia/Shanghai' })
  async generateWeeklyLetters(): Promise<void> {
    const now = new Date();
    const weekStart = this.getMondayMidnightCST(now); // 本周一 00:00 CST
    const weekEnd = now;                               // 本周日 20:00 CST（即当前时刻）

    this.logger.log(
      `[Sarah Cron] Start — weekStart: ${weekStart.toISOString()}, weekEnd: ${weekEnd.toISOString()}`,
    );

    let users: { id: string }[];
    try {
      users = await this.prisma.user.findMany({
        where: { status: 'active' },
        select: { id: true },
      });
    } catch (error) {
      this.logger.error(`[Sarah Cron] Failed to fetch users: ${this.errorMessage(error)}`);
      return;
    }

    this.logger.log(`[Sarah Cron] Processing ${users.length} active users`);

    let generated = 0;
    let skippedExisting = 0;
    let skippedNoRecords = 0;
    let failed = 0;

    for (const user of users) {
      try {
        const result = await this.sarahService.generateWeeklyForUser(user.id, weekStart, weekEnd);
        switch (result) {
          case 'generated':        generated++;        break;
          case 'skipped_existing': skippedExisting++;  break;
          case 'skipped_no_records': skippedNoRecords++; break;
        }
      } catch (error) {
        failed++;
        this.logger.error(
          `[Sarah Cron] Failed for user ${user.id}: ${this.errorMessage(error)}`,
        );
        // TODO: 可写入 failed_jobs 表以支持后续手动重试
      }
    }

    this.logger.log(
      `[Sarah Cron] Done — generated: ${generated}, ` +
      `skipped(existing): ${skippedExisting}, skipped(no records): ${skippedNoRecords}, ` +
      `failed: ${failed}, total: ${users.length}`,
    );
  }

  /**
   * 计算给定时刻所在 ISO 周的周一 00:00 CST（转为 UTC 存储）。
   *
   * 实现思路：
   *   1. 将 UTC 时间加 8h，在"CST 坐标系"中操作
   *   2. 找到该日期对应周的周一，并将时间归零（仍在 CST 坐标系）
   *   3. 减去 8h，转回 UTC
   *
   * 示例（Cron 触发时刻 = Sunday 12:00 UTC = Sunday 20:00 CST）：
   *   → 返回 Sunday 16:00 UTC（前一周日）= Monday 00:00 CST（本周一）
   */
  private getMondayMidnightCST(now: Date): Date {
    // 用 UTC 操作模拟 CST：加 8h 使 UTC 时间等于 CST 的钟面时间
    const cstNow = new Date(now.getTime() + CST_OFFSET_MS);

    // 在 CST 坐标系中，找到"本周一"
    const cstDay = cstNow.getUTCDay(); // 0=Sun … 6=Sat
    const daysSinceMonday = cstDay === 0 ? 6 : cstDay - 1;
    const cstMonday = new Date(cstNow);
    cstMonday.setUTCDate(cstMonday.getUTCDate() - daysSinceMonday);
    cstMonday.setUTCHours(0, 0, 0, 0); // 周一 00:00（CST 坐标系）

    // 减去 8h，得到实际 UTC 时间
    return new Date(cstMonday.getTime() - CST_OFFSET_MS);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
