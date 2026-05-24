import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmotionTrendQuery, WeeklyAnalysisQuery } from './dto/analysis.dto';

// ─── Internal types ────────────────────────────────────────────────────────────

interface NvcFeeling {
  label: string;
  intensity: number | null;
}

interface MoodEntry {
  label: string;
  /** null 表示来源是 moods 字段（无强度数据） */
  intensity: number | null;
}

interface MoodStat {
  count: number;
  intensities: number[];
}

interface NeedStat {
  count: number;
}

interface Period {
  start: Date;
  label: string;
}

// ─── Utility functions ─────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const WEEKDAYS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const TIME_BUCKETS = [
  { name: '早上', range: '06:00–11:59', hours: new Set([6, 7, 8, 9, 10, 11]) },
  { name: '下午', range: '12:00–17:59', hours: new Set([12, 13, 14, 15, 16, 17]) },
  { name: '晚上', range: '18:00–22:59', hours: new Set([18, 19, 20, 21, 22]) },
  { name: '凌晨', range: '23:00–05:59', hours: new Set([23, 0, 1, 2, 3, 4, 5]) },
];

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════
  // 1. Weekly Analysis
  // ═══════════════════════════════════════════════════════════

  async getWeekly(userId: string, query: WeeklyAnalysisQuery) {
    const { start, end } = this.resolveWeeklyRange(query);

    const [records, lastWeekRecords] = await Promise.all([
      this.fetchRecords(userId, start, end),
      this.fetchRecords(userId, this.shiftDate(start, -7), this.shiftDate(end, -7)),
    ]);

    if (records.length === 0) {
      throw new HttpException({ code: 'NO_RECORDS', message: '该周无任何记录' }, 404);
    }

    return this.buildWeeklyResponse(records, lastWeekRecords, start, end);
  }

  private resolveWeeklyRange(query: WeeklyAnalysisQuery): { start: Date; end: Date } {
    if (query.week) {
      return this.parseIsoWeek(query.week);
    }
    if (query.start_date && query.end_date) {
      return this.parseDateRange(query.start_date, query.end_date);
    }
    throw new BadRequestException({
      code: 'INVALID_RANGE',
      message: '请提供 week 参数或 start_date + end_date 参数',
    });
  }

  /**
   * 解析 ISO 周格式 YYYY-Www，返回该周一（含）到下周一（不含）
   * ISO 规则：包含当年第一个周四的那周为第 1 周
   */
  private parseIsoWeek(week: string): { start: Date; end: Date } {
    const match = /^(\d{4})-W(\d{1,2})$/.exec(week);
    if (!match) {
      throw new BadRequestException({ code: 'INVALID_RANGE', message: 'week 格式应为 YYYY-Www，如 2026-W21' });
    }
    const year = Number(match[1]);
    const weekNum = Number(match[2]);
    if (weekNum < 1 || weekNum > 53) {
      throw new BadRequestException({ code: 'INVALID_RANGE', message: 'week 编号不合法（1–53）' });
    }
    // 1月4日永远在第1周内；找到该年第1周的周一
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dow = jan4.getUTCDay() || 7; // 转为 1=Mon … 7=Sun
    const week1Monday = new Date(jan4.getTime() - (dow - 1) * 86_400_000);
    const start = new Date(week1Monday.getTime() + (weekNum - 1) * 7 * 86_400_000);
    const end = new Date(start.getTime() + 7 * 86_400_000); // 不含
    return { start, end };
  }

  /**
   * start_date 和 end_date 均为 YYYY-MM-DD；end_date 包含当天
   */
  private parseDateRange(startStr: string, endStr: string): { start: Date; end: Date } {
    const start = new Date(startStr);
    const endInclusive = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(endInclusive.getTime())) {
      throw new BadRequestException({ code: 'INVALID_RANGE', message: '日期格式错误，请使用 YYYY-MM-DD' });
    }
    if (start > endInclusive) {
      throw new BadRequestException({ code: 'INVALID_RANGE', message: 'start_date 不能晚于 end_date' });
    }
    const end = new Date(endInclusive.getTime() + 86_400_000); // 转为不含
    const diffDays = (end.getTime() - start.getTime()) / 86_400_000;
    if (diffDays > 8) {
      // 允许 8 天余量，兼容跨夏令时等边界
      throw new BadRequestException({ code: 'INVALID_RANGE', message: '日期范围超过 7 天' });
    }
    return { start, end };
  }

  private buildWeeklyResponse(records: any[], lastWeekRecords: any[], start: Date, end: Date) {
    const toDateStr = (d: Date) => d.toISOString().slice(0, 10);
    const endInclusive = new Date(end.getTime() - 86_400_000);

    const overview = this.buildOverview(records);
    const lastWeekOverview = this.buildOverview(lastWeekRecords);
    const peakTime = this.buildPeakTime(records);

    const { moodStats, needStats, recordsWithMood, recordsWithNeed } = this.buildEmotionStats(records);
    const { moodStats: lastMoodStats, needStats: lastNeedStats } = this.buildEmotionStats(lastWeekRecords);

    const topMoods = [...moodStats.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([label, stat]) => ({
        label,
        count: stat.count,
        percentage: recordsWithMood > 0 ? round1((stat.count / recordsWithMood) * 100) : 0,
        avg_intensity: stat.intensities.length > 0 ? round1(avg(stat.intensities)) : null,
        vs_last_week: stat.count - (lastMoodStats.get(label)?.count ?? 0),
      }));

    const topNeeds = [...needStats.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([label, stat]) => ({
        label,
        count: stat.count,
        percentage: recordsWithNeed > 0 ? round1((stat.count / recordsWithNeed) * 100) : 0,
        vs_last_week: stat.count - (lastNeedStats.get(label)?.count ?? 0),
      }));

    // mood_shifts: 本周 top5，排除 delta=0
    const moodShifts = topMoods
      .slice(0, 5)
      .filter((m) => m.vs_last_week !== 0)
      .map((m) => ({ label: m.label, delta: m.vs_last_week, direction: m.vs_last_week > 0 ? 'up' : 'down' }));

    const needShifts = topNeeds
      .slice(0, 5)
      .filter((n) => n.vs_last_week !== 0)
      .map((n) => ({ label: n.label, delta: n.vs_last_week, direction: n.vs_last_week > 0 ? 'up' : 'down' }));

    return {
      week_range: `${toDateStr(start)} ~ ${toDateStr(endInclusive)}`,
      period: { start: toDateStr(start), end: toDateStr(endInclusive) },
      overview,
      peak_time: peakTime,
      emotions: {
        coverage: {
          total_records: records.length,
          records_with_mood: recordsWithMood,
          records_with_need: recordsWithNeed,
          mood_coverage_rate: records.length > 0 ? round2(recordsWithMood / records.length) : 0,
          need_coverage_rate: records.length > 0 ? round2(recordsWithNeed / records.length) : 0,
        },
        top_moods: topMoods,
        top_needs: topNeeds,
      },
      changes_vs_last_week: {
        records_delta: records.length - lastWeekRecords.length,
        active_days_delta: overview.active_days - lastWeekOverview.active_days,
        mood_shifts: moodShifts,
        need_shifts: needShifts,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 2. Emotion Trend
  // ═══════════════════════════════════════════════════════════

  async getEmotionTrend(userId: string, query: EmotionTrendQuery) {
    const start = this.parseDay(query.start_date, 'start_date');
    const endInclusive = this.parseDay(query.end_date, 'end_date');
    const end = new Date(endInclusive.getTime() + 86_400_000); // 转为不含

    const diffDays = (end.getTime() - start.getTime()) / 86_400_000;
    if (diffDays > 366) {
      throw new BadRequestException({ code: 'RANGE_TOO_LARGE', message: '查询范围超过 366 天' });
    }
    if (start >= end) {
      throw new BadRequestException({ code: 'RANGE_TOO_LARGE', message: 'start_date 不能晚于 end_date' });
    }

    const granularity = query.granularity ?? 'week';
    const topN = query.top_n ?? 5;

    const records = await this.fetchRecords(userId, start, end);

    // 按粒度切分周期
    const periods = this.buildPeriods(start, end, granularity);

    // 将每条记录分配到对应的周期桶
    const periodRecords = new Map<string, any[]>();
    for (const p of periods) {
      periodRecords.set(p.start.toISOString(), []);
    }
    for (const record of records) {
      const ts = new Date(record.createdAtClient).getTime();
      for (let i = periods.length - 1; i >= 0; i--) {
        if (ts >= periods[i].start.getTime()) {
          periodRecords.get(periods[i].start.toISOString())!.push(record);
          break;
        }
      }
    }

    // 全局 top N 情绪 / 需求
    const globalMoodCount = new Map<string, number>();
    const globalNeedCount = new Map<string, number>();
    for (const record of records) {
      for (const { label } of this.extractMoods(record)) {
        globalMoodCount.set(label, (globalMoodCount.get(label) ?? 0) + 1);
      }
      for (const label of this.extractNeeds(record)) {
        globalNeedCount.set(label, (globalNeedCount.get(label) ?? 0) + 1);
      }
    }

    const topMoods = [...globalMoodCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([label]) => label);

    const topNeeds = [...globalNeedCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([label]) => label);

    const topMoodSet = new Set(topMoods);
    const topNeedSet = new Set(topNeeds);

    // 构建趋势数组
    const moodTrend = periods.map((period) => {
      const pRecords = periodRecords.get(period.start.toISOString()) ?? [];
      const { moodStats, recordsWithMood } = this.buildEmotionStats(pRecords);
      const data = [...moodStats.entries()]
        .filter(([label]) => topMoodSet.has(label))
        .sort((a, b) => b[1].count - a[1].count)
        .map(([label, stat]) => ({
          label,
          count: stat.count,
          percentage: recordsWithMood > 0 ? round1((stat.count / recordsWithMood) * 100) : 0,
          avg_intensity: stat.intensities.length > 0 ? round1(avg(stat.intensities)) : null,
        }));
      return {
        period_label: period.label,
        period_start: period.start.toISOString().slice(0, 10),
        total_records: pRecords.length,
        data,
      };
    });

    const needTrend = periods.map((period) => {
      const pRecords = periodRecords.get(period.start.toISOString()) ?? [];
      const { needStats, recordsWithNeed } = this.buildEmotionStats(pRecords);
      const data = [...needStats.entries()]
        .filter(([label]) => topNeedSet.has(label))
        .sort((a, b) => b[1].count - a[1].count)
        .map(([label, stat]) => ({
          label,
          count: stat.count,
          percentage: recordsWithNeed > 0 ? round1((stat.count / recordsWithNeed) * 100) : 0,
        }));
      return {
        period_label: period.label,
        period_start: period.start.toISOString().slice(0, 10),
        total_records: pRecords.length,
        data,
      };
    });

    const peakTimeTrend = periods
      .map((period) => {
        const pRecords = periodRecords.get(period.start.toISOString()) ?? [];
        if (pRecords.length === 0) return null;
        const pt = this.buildPeakTime(pRecords);
        return {
          period_label: period.label,
          period_start: period.start.toISOString().slice(0, 10),
          peak_bucket: pt.bucket,
          top_hours: pt.top_hours,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const summary = this.buildTrendSummary(periods, periodRecords);

    return {
      period: { start: query.start_date, end: query.end_date, granularity },
      top_moods: topMoods,
      top_needs: topNeeds,
      mood_trend: moodTrend,
      need_trend: needTrend,
      peak_time_trend: peakTimeTrend,
      summary,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Shared building blocks
  // ═══════════════════════════════════════════════════════════

  private async fetchRecords(userId: string, start: Date, end: Date) {
    return this.prisma.record.findMany({
      where: {
        userId,
        deletedAt: null,
        createdAtClient: { gte: start, lt: end },
      },
      orderBy: { createdAtClient: 'asc' },
    });
  }

  private buildOverview(records: any[]) {
    if (records.length === 0) {
      return { total_records: 0, active_days: 0, longest_streak: 0, busiest_weekday: null, busiest_weekday_count: 0 };
    }

    const daySet = new Set<string>();
    const weekdayCount = new Map<string, number>();

    for (const r of records) {
      const d = new Date(r.createdAtClient);
      daySet.add(d.toISOString().slice(0, 10));
      const wd = WEEKDAYS_ZH[d.getUTCDay()];
      weekdayCount.set(wd, (weekdayCount.get(wd) ?? 0) + 1);
    }

    // 计算最长连续打卡天数
    const sortedDays = [...daySet].sort();
    let longestStreak = 1;
    let currentStreak = 1;
    for (let i = 1; i < sortedDays.length; i++) {
      const diffMs = new Date(sortedDays[i]).getTime() - new Date(sortedDays[i - 1]).getTime();
      if (diffMs === 86_400_000) {
        currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }

    // 最多记录的星期几
    let busiestWeekday = '';
    let busiestCount = 0;
    for (const [wd, count] of weekdayCount) {
      if (count > busiestCount) {
        busiestCount = count;
        busiestWeekday = wd;
      }
    }

    return {
      total_records: records.length,
      active_days: daySet.size,
      longest_streak: longestStreak,
      busiest_weekday: busiestWeekday,
      busiest_weekday_count: busiestCount,
    };
  }

  private buildPeakTime(records: any[]) {
    const hourCount = new Map<number, number>();
    for (const r of records) {
      const hour = new Date(r.createdAtClient).getUTCHours();
      hourCount.set(hour, (hourCount.get(hour) ?? 0) + 1);
    }

    const hourlyDistribution = [...hourCount.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hour, count]) => ({ hour, count }));

    const topHours = [...hourCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => hour);

    // 按时段桶汇总，找出最高峰桶
    let peakBucket = TIME_BUCKETS[0];
    let peakCount = 0;
    for (const bucket of TIME_BUCKETS) {
      const count = [...bucket.hours].reduce((sum, h) => sum + (hourCount.get(h) ?? 0), 0);
      if (count > peakCount) {
        peakCount = count;
        peakBucket = bucket;
      }
    }

    return {
      bucket: peakBucket.name,
      bucket_range: peakBucket.range,
      top_hours: topHours,
      hourly_distribution: hourlyDistribution,
    };
  }

  private buildEmotionStats(records: any[]): {
    moodStats: Map<string, MoodStat>;
    needStats: Map<string, NeedStat>;
    recordsWithMood: number;
    recordsWithNeed: number;
  } {
    const moodStats = new Map<string, MoodStat>();
    const needStats = new Map<string, NeedStat>();
    let recordsWithMood = 0;
    let recordsWithNeed = 0;

    for (const record of records) {
      const moods = this.extractMoods(record);
      const needs = this.extractNeeds(record);

      if (moods.length > 0) {
        recordsWithMood++;
        for (const { label, intensity } of moods) {
          if (!moodStats.has(label)) moodStats.set(label, { count: 0, intensities: [] });
          const s = moodStats.get(label)!;
          s.count++;
          if (intensity !== null) s.intensities.push(intensity);
        }
      }

      if (needs.length > 0) {
        recordsWithNeed++;
        for (const label of needs) {
          if (!needStats.has(label)) needStats.set(label, { count: 0 });
          needStats.get(label)!.count++;
        }
      }
    }

    return { moodStats, needStats, recordsWithMood, recordsWithNeed };
  }

  /**
   * 从单条 record 提取情绪标签。
   * 优先取 nvc.feelings（有 intensity）；moods 字段补充（intensity 为 null）。
   * 同一标签在两个来源都出现时，保留 nvc 版本（有 intensity）。
   */
  private extractMoods(record: any): MoodEntry[] {
    const result = new Map<string, number | null>();

    for (const f of this.extractNvcFeelings(record.nvc)) {
      result.set(f.label, f.intensity);
    }

    if (Array.isArray(record.moods)) {
      for (const m of record.moods) {
        const label = String(m ?? '').trim();
        if (label && !result.has(label)) {
          result.set(label, null);
        }
      }
    }

    return [...result.entries()].map(([label, intensity]) => ({ label, intensity }));
  }

  private extractNeeds(record: any): string[] {
    if (!Array.isArray(record.needs)) return [];
    return record.needs.map((n: unknown) => String(n ?? '').trim()).filter((n: string) => n.length > 0);
  }

  /** 安全解析 nvc.feelings 数组 */
  private extractNvcFeelings(nvc: unknown): NvcFeeling[] {
    if (!nvc || typeof nvc !== 'object') return [];
    const feelings = (nvc as Record<string, unknown>)['feelings'];
    if (!Array.isArray(feelings)) return [];
    return feelings
      .filter((f): f is Record<string, unknown> => f !== null && typeof f === 'object')
      .map((f) => ({
        label: String(f['label'] ?? '').trim(),
        intensity: typeof f['intensity'] === 'number' ? f['intensity'] : null,
      }))
      .filter((f) => f.label.length > 0);
  }

  // ═══════════════════════════════════════════════════════════
  // Trend helpers
  // ═══════════════════════════════════════════════════════════

  /**
   * 将 [start, end) 按 granularity 切成周期列表
   */
  private buildPeriods(start: Date, end: Date, granularity: string): Period[] {
    const periods: Period[] = [];
    let current = new Date(start);

    while (current < end) {
      let next: Date;
      let label: string;

      if (granularity === 'day') {
        next = new Date(current.getTime() + 86_400_000);
        label = `${current.getUTCMonth() + 1}/${current.getUTCDate()}`;
      } else if (granularity === 'month') {
        const y = current.getUTCFullYear();
        const m = current.getUTCMonth();
        next = new Date(Date.UTC(y, m + 1, 1));
        label = `${m + 1}月`;
      } else {
        // week（默认）：以 start 为基准，每 7 天一格
        const weekEnd = new Date(current.getTime() + 7 * 86_400_000);
        next = weekEnd < end ? weekEnd : end;
        const periodLast = new Date(next.getTime() - 86_400_000);
        label =
          `${current.getUTCMonth() + 1}/${current.getUTCDate()}` +
          `–${periodLast.getUTCMonth() + 1}/${periodLast.getUTCDate()}`;
      }

      periods.push({ start: new Date(current), label });
      current = next;
    }

    return periods;
  }

  private buildTrendSummary(periods: Period[], periodRecords: Map<string, any[]>) {
    // 每个周期的 top1 情绪
    const periodTop1: (string | null)[] = periods.map((p) => {
      const pRecords = periodRecords.get(p.start.toISOString()) ?? [];
      if (pRecords.length === 0) return null;
      const { moodStats } = this.buildEmotionStats(pRecords);
      if (moodStats.size === 0) return null;
      let top1 = '';
      let top1Count = 0;
      for (const [label, stat] of moodStats) {
        if (stat.count > top1Count) {
          top1Count = stat.count;
          top1 = label;
        }
      }
      return top1 || null;
    });

    // 统计每个情绪当过 top1 的次数
    const dominanceCount = new Map<string, number>();
    for (const mood of periodTop1) {
      if (mood) dominanceCount.set(mood, (dominanceCount.get(mood) ?? 0) + 1);
    }

    let dominantMood: string | null = null;
    let dominantMoodPeriods = 0;
    for (const [mood, count] of dominanceCount) {
      if (count > dominantMoodPeriods) {
        dominantMoodPeriods = count;
        dominantMood = mood;
      }
    }

    // 最长连续周期（同一情绪持续为 top1）
    let longestStreak = 0;
    let longestStreakStart: string | null = null;
    let currentStreak = 0;
    let currentStreakStart: string | null = null;

    for (let i = 0; i < periodTop1.length; i++) {
      if (dominantMood && periodTop1[i] === dominantMood) {
        if (currentStreak === 0) currentStreakStart = periods[i].start.toISOString().slice(0, 10);
        currentStreak++;
        if (currentStreak > longestStreak) {
          longestStreak = currentStreak;
          longestStreakStart = currentStreakStart;
        }
      } else {
        currentStreak = 0;
        currentStreakStart = null;
      }
    }

    return {
      dominant_mood: dominantMood,
      dominant_mood_weeks: dominantMoodPeriods,
      total_weeks: periods.length,
      longest_mood_streak:
        dominantMood && longestStreak > 0
          ? { label: dominantMood, streak_periods: longestStreak, streak_start: longestStreakStart }
          : null,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Utils
  // ═══════════════════════════════════════════════════════════

  private parseDay(dateStr: string, field: string): Date {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      throw new BadRequestException({ code: 'INVALID_GRANULARITY', message: `${field} 日期格式错误，请使用 YYYY-MM-DD` });
    }
    return d;
  }

  private shiftDate(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 86_400_000);
  }
}
