import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesService } from '../devices/devices.service';
import { ApnsService } from '../push/apns.service';
import { SarahService } from './sarah.service';

const CST_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

@Injectable()
export class SarahSchedulerService {
  private readonly logger = new Logger(SarahSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sarahService: SarahService,
    private readonly devicesService: DevicesService,
    private readonly apnsService: ApnsService,
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
          case 'generated':
            generated++;
            // 异步推送，不影响主流程
            this.sendPushNotification(user.id).catch((err) =>
              this.logger.error(`[Sarah Cron] Push failed for user ${user.id}: ${this.errorMessage(err)}`),
            );
            break;
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
   * 历史补全：扫描 record 表，对所有用户的每一个自然周（北京时间）补发 Sarah 信件。
   * 已生成过的周自动跳过（幂等），当前未结束的周不处理。
   * 通过 POST /sarah/admin/backfill-historical 触发，在后台异步执行。
   */
  async backfillHistoricalLetters(): Promise<void> {
    this.logger.log('[Sarah Backfill] Starting...');

    // 找最早一条记录，确定补全起点
    const earliest = await this.prisma.record.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAtClient: 'asc' },
      select: { createdAtClient: true },
    });
    if (!earliest?.createdAtClient) {
      this.logger.log('[Sarah Backfill] No records found, nothing to backfill');
      return;
    }

    // 只补已结束的完整自然周（不含当前周）
    const weeks = this.getCompletedWeeksBetween(earliest.createdAtClient, new Date());
    this.logger.log(`[Sarah Backfill] ${weeks.length} completed weeks to process`);

    // 取所有有记录的用户（不限 active 状态，历史数据也需要补）
    const userRows = await this.prisma.record.findMany({
      where: { deletedAt: null },
      select: { userId: true },
      distinct: ['userId'],
    });
    this.logger.log(`[Sarah Backfill] ${userRows.length} users with records`);

    let generated = 0, skippedExisting = 0, skippedNoRecords = 0, failed = 0;

    for (const { userId } of userRows) {
      for (const { weekStart, weekEnd } of weeks) {
        try {
          const result = await this.sarahService.generateWeeklyForUser(userId, weekStart, weekEnd);
          switch (result) {
            case 'generated':          generated++;        break;
            case 'skipped_existing':   skippedExisting++;  break;
            case 'skipped_no_records': skippedNoRecords++; break;
          }
        } catch (error) {
          failed++;
          this.logger.error(
            `[Sarah Backfill] Failed user=${userId} week=${weekStart.toISOString()}: ${this.errorMessage(error)}`,
          );
        }
      }
    }

    this.logger.log(
      `[Sarah Backfill] Done — generated: ${generated}, ` +
      `skipped(existing): ${skippedExisting}, skipped(no records): ${skippedNoRecords}, failed: ${failed}`,
    );

    // 补全完成后，自动去重：同一用户同一周已有 weekly 信件时，软删对应的 legacy 信件
    await this.deduplicateHistoricalLetters();
  }

  /**
   * 去重：对所有用户，若某周同时存在 legacy 和 weekly 两封信，
   * 以 AI 生成的 weekly 为准，将 legacy 软删除。
   * 可单独触发（POST /sarah/admin/dedup-historical），也在 backfill 后自动执行。
   */
  async deduplicateHistoricalLetters(): Promise<{ deduped: number }> {
    this.logger.log('[Sarah Dedup] Starting...');

    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    // 取所有有效的 weekly 信件（weekStart 不为空）
    const weeklyLetters = await this.prisma.sarahLetter.findMany({
      where: { type: 'weekly', deletedAt: null, weekStart: { not: null } },
      select: { userId: true, weekStart: true },
    });

    this.logger.log(`[Sarah Dedup] ${weeklyLetters.length} weekly letters to check`);

    let deduped = 0;

    for (const weekly of weeklyLetters) {
      // 同一用户、同一自然周内的 legacy 信件全部软删
      const result = await this.prisma.sarahLetter.updateMany({
        where: {
          userId: weekly.userId,
          type: 'legacy',
          deletedAt: null,
          weekStart: {
            gte: weekly.weekStart!,
            lt: new Date(weekly.weekStart!.getTime() + ONE_WEEK_MS),
          },
        },
        data: { deletedAt: new Date() },
      });
      deduped += result.count;
    }

    this.logger.log(`[Sarah Dedup] Done — soft-deleted ${deduped} duplicate legacy letters`);
    return { deduped };
  }

  /**
   * 向用户所有 iOS 设备发送 Sarah 新信件推送通知。
   * 若 APNs 返回 410（token 已失效），自动从数据库删除该 token。
   */
  private async sendPushNotification(userId: string): Promise<void> {
    const tokens = await this.devicesService.getTokensByUser(userId, 'ios');
    if (tokens.length === 0) return;

    const payload = {
      aps: {
        alert: {
          title: 'Sarah 的新信件',
          body: '你本周的 Sarah 信件已经生成，快来看看吧 ✉️',
        },
        sound: 'default',
        badge: 1,
      },
      type: 'sarah_letter',
    };

    await Promise.all(
      tokens.map(async (token) => {
        const result = await this.apnsService.send(token, payload);
        if (result.tokenExpired) {
          this.logger.warn(`[Sarah Push] Token expired, removing: ${token.slice(0, 8)}...`);
          await this.devicesService.removeToken(token);
        }
      }),
    );

    this.logger.log(`[Sarah Push] Sent to ${tokens.length} device(s) for user ${userId}`);
  }

  /**
   * 返回从 start 到 end 之间所有已完成的自然周（北京时间周一 00:00 ～ 周日 23:59:59）。
   * 当前未结束的周不包含在内。
   */
  private getCompletedWeeksBetween(
    start: Date,
    end: Date,
  ): Array<{ weekStart: Date; weekEnd: Date }> {
    const weeks: Array<{ weekStart: Date; weekEnd: Date }> = [];

    // start 所在周的周一 00:00 CST（UTC 表示）
    let weekStart = this.getMondayMidnightCST(start);

    // end 所在周的周一 00:00 CST（UTC 表示）——当前周，不包含
    const currentWeekStart = this.getMondayMidnightCST(end);

    while (weekStart < currentWeekStart) {
      // 周日 23:59:59.999 CST = weekStart + 7天 - 1ms
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
      weeks.push({ weekStart, weekEnd });
      weekStart = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    return weeks;
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
