import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SyncDailyMoodDto,
  SyncDailySummaryDto,
  SyncInsightReportDto,
  SyncProfileDto,
  SyncPushDto,
  SyncRecordDto,
  SyncWeeklyInsightDto,
} from './dto/sync.dto';

type EntityType =
  | 'profile'
  | 'record'
  | 'daily_summary'
  | 'daily_mood'
  | 'insight_report'
  | 'weekly_insight';

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(userId: string) {
    const [profile, records, dailySummaries, dailyMoods, insightReports, weeklyInsights, cursor] =
      await Promise.all([
        this.prisma.userProfile.findUnique({ where: { userId } }),
        this.prisma.record.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAtClient: 'desc' } }),
        this.prisma.dailySummary.findMany({ where: { userId, deletedAt: null } }),
        this.prisma.dailyMood.findMany({ where: { userId, deletedAt: null } }),
        this.prisma.insightReport.findMany({ where: { userId, deletedAt: null } }),
        this.prisma.weeklyInsight.findMany({ where: { userId, deletedAt: null } }),
        this.latestRevision(userId),
      ]);

    return {
      cursor,
      profile: this.profilePayload(profile),
      records: records.map((item) => this.recordPayload(item)),
      dailySummaries: dailySummaries.map((item) => this.dailySummaryPayload(item)),
      dailyMoods: dailyMoods.map((item) => this.dailyMoodPayload(item)),
      insightReports: insightReports.map((item) => this.insightReportPayload(item)),
      weeklyInsights: weeklyInsights.map((item) => this.weeklyInsightPayload(item)),
    };
  }

  async push(userId: string, dto: SyncPushDto) {
    let accepted = 0;
    const changes: Array<{ entityType: EntityType; entityId: string; payload: Record<string, unknown> }> = [];

    if (dto.profile) {
      const payload = await this.applyProfile(userId, dto.profile);
      if (payload) changes.push(payload);
    }

    for (const record of dto.records ?? []) {
      const payload = await this.applyRecord(userId, record);
      if (payload) changes.push(payload);
    }

    for (const summary of dto.dailySummaries ?? []) {
      const payload = await this.applyDailySummary(userId, summary);
      if (payload) changes.push(payload);
    }

    for (const mood of dto.dailyMoods ?? []) {
      const payload = await this.applyDailyMood(userId, mood);
      if (payload) changes.push(payload);
    }

    for (const report of dto.insightReports ?? []) {
      const payload = await this.applyInsightReport(userId, report);
      if (payload) changes.push(payload);
    }

    for (const insight of dto.weeklyInsights ?? []) {
      const payload = await this.applyWeeklyInsight(userId, insight);
      if (payload) changes.push(payload);
    }

    for (const change of changes) {
      await this.recordChange(userId, change.entityType, change.entityId, change.payload);
      accepted += 1;
    }

    return {
      accepted,
      cursor: await this.latestRevision(userId),
    };
  }

  async pull(userId: string, cursor = '0') {
    const since = BigInt(cursor || '0');
    const changes = await this.prisma.syncChange.findMany({
      where: { userId },
      orderBy: { revision: 'asc' },
    });
    const filtered = changes.filter((change) => BigInt(change.revision) > since);
    return {
      cursor: await this.latestRevision(userId),
      changes: filtered.map((change) => ({
        revision: BigInt(change.revision).toString(),
        entityType: change.entityType,
        entityId: change.entityId,
        payload: change.payload,
      })),
    };
  }

  private async applyProfile(userId: string, dto: SyncProfileDto) {
    const clientUpdatedAt = this.parseDate(dto.clientUpdatedAt) ?? new Date();
    const existing = await this.prisma.userProfile.findUnique({ where: { userId } });
    if (existing && existing.clientUpdatedAt > clientUpdatedAt) return null;

    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        avatar: dto.avatar ?? null,
        nickname: dto.nickname ?? null,
        signature: dto.signature ?? null,
        clientUpdatedAt,
      },
      update: {
        avatar: dto.avatar ?? null,
        nickname: dto.nickname ?? null,
        signature: dto.signature ?? null,
        clientUpdatedAt,
      },
    });

    return {
      entityType: 'profile' as const,
      entityId: userId,
      payload: this.profilePayload(profile),
    };
  }

  private async applyRecord(userId: string, dto: SyncRecordDto) {
    const clientUpdatedAt = new Date(dto.updatedAt);
    const existing = await this.prisma.record.findFirst({
      where: { userId, clientRecordId: dto.id },
    });
    if (existing && existing.clientUpdatedAt > clientUpdatedAt) return null;

    const data = {
      userId,
      clientRecordId: dto.id,
      type: dto.type,
      transcription: dto.transcription,
      createdAtClient: new Date(dto.createdAt),
      clientUpdatedAt,
      audioUrl: null,
      duration: dto.duration ?? null,
      processingMode: dto.processingMode ?? null,
      moods: dto.moods ?? null,
      needs: dto.needs ?? null,
      nvc: dto.nvc ?? null,
      title: dto.title ?? null,
      summary: dto.summary ?? null,
      date: dto.date ?? null,
      referencedFragments: dto.referencedFragments ?? null,
      weekRange: dto.weekRange ?? null,
      referencedRecords: dto.referencedRecords ?? null,
      patternFeedback: dto.patternFeedback ?? null,
      deletedAt: this.parseDate(dto.deletedAt),
    };

    const record = existing
      ? await this.prisma.record.update({ where: { id: existing.id }, data: data as any })
      : await this.prisma.record.create({ data: data as any });

    return {
      entityType: 'record' as const,
      entityId: record.clientRecordId,
      payload: this.recordPayload(record),
    };
  }

  private async applyDailySummary(userId: string, dto: SyncDailySummaryDto) {
    const clientUpdatedAt = this.parseDate(dto.clientUpdatedAt) ?? new Date(dto.generatedAt);
    const existing = await this.prisma.dailySummary.findFirst({ where: { userId, dateKey: dto.date } });
    if (existing && existing.clientUpdatedAt > clientUpdatedAt) return null;

    const data = {
      userId,
      dateKey: dto.date,
      moodWord: dto.moodWord,
      oneSentence: dto.oneSentence,
      score: dto.score,
      recordCount: dto.recordCount,
      generatedAt: new Date(dto.generatedAt),
      userOverridden: dto.userOverridden,
      clientUpdatedAt,
      deletedAt: this.parseDate(dto.deletedAt),
    };
    const item = existing
      ? await this.prisma.dailySummary.update({ where: { id: existing.id }, data })
      : await this.prisma.dailySummary.create({ data });
    return {
      entityType: 'daily_summary' as const,
      entityId: item.dateKey,
      payload: this.dailySummaryPayload(item),
    };
  }

  private async applyDailyMood(userId: string, dto: SyncDailyMoodDto) {
    const clientUpdatedAt = this.parseDate(dto.clientUpdatedAt) ?? new Date();
    const existing = await this.prisma.dailyMood.findFirst({ where: { userId, dateKey: dto.date } });
    if (existing && existing.clientUpdatedAt > clientUpdatedAt) return null;

    const data = {
      userId,
      dateKey: dto.date,
      imagePath: dto.imagePath,
      clientUpdatedAt,
      deletedAt: this.parseDate(dto.deletedAt),
    };
    const item = existing
      ? await this.prisma.dailyMood.update({ where: { id: existing.id }, data })
      : await this.prisma.dailyMood.create({ data });
    return {
      entityType: 'daily_mood' as const,
      entityId: item.dateKey,
      payload: this.dailyMoodPayload(item),
    };
  }

  private async applyInsightReport(userId: string, dto: SyncInsightReportDto) {
    const clientUpdatedAt = this.parseDate(dto.clientUpdatedAt) ?? new Date(dto.cachedAt);
    const existing = await this.prisma.insightReport.findFirst({
      where: { userId, periodType: dto.periodType, periodKey: dto.periodKey },
    });
    if (existing && existing.clientUpdatedAt > clientUpdatedAt) return null;

    const data = {
      userId,
      periodType: dto.periodType,
      periodKey: dto.periodKey,
      weekRange: dto.weekRange ?? null,
      report: dto.report,
      cachedAt: new Date(dto.cachedAt),
      recordCount: dto.recordCount ?? null,
      clientUpdatedAt,
      deletedAt: this.parseDate(dto.deletedAt),
    };
    const item = existing
      ? await this.prisma.insightReport.update({ where: { id: existing.id }, data: data as any })
      : await this.prisma.insightReport.create({ data: data as any });
    return {
      entityType: 'insight_report' as const,
      entityId: `${item.periodType}:${item.periodKey}`,
      payload: this.insightReportPayload(item),
    };
  }

  private async applyWeeklyInsight(userId: string, dto: SyncWeeklyInsightDto) {
    const clientUpdatedAt = this.parseDate(dto.clientUpdatedAt) ?? new Date();
    const existing = await this.prisma.weeklyInsight.findFirst({
      where: { userId, clientInsightId: dto.id },
    });
    if (existing && existing.clientUpdatedAt > clientUpdatedAt) return null;

    const data = {
      userId,
      clientInsightId: dto.id,
      weekRange: dto.weekRange,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      payload: dto.payload,
      clientUpdatedAt,
      deletedAt: this.parseDate(dto.deletedAt),
    };
    const item = existing
      ? await this.prisma.weeklyInsight.update({ where: { id: existing.id }, data: data as any })
      : await this.prisma.weeklyInsight.create({ data: data as any });
    return {
      entityType: 'weekly_insight' as const,
      entityId: item.clientInsightId,
      payload: this.weeklyInsightPayload(item),
    };
  }

  private async recordChange(
    userId: string,
    entityType: EntityType,
    entityId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const next = BigInt(await this.latestRevision(userId)) + 1n;
    await this.prisma.syncChange.create({
      data: {
        userId,
        revision: next,
        entityType,
        entityId,
        payload: payload as any,
      },
    });
  }

  private async latestRevision(userId: string): Promise<string> {
    const latest = await this.prisma.syncChange.findFirst({
      where: { userId },
      orderBy: { revision: 'desc' },
    });
    return latest ? BigInt(latest.revision).toString() : '0';
  }

  private profilePayload(profile: any) {
    return {
      avatar: profile?.avatar ?? null,
      nickname: profile?.nickname ?? null,
      signature: profile?.signature ?? null,
      clientUpdatedAt: this.iso(profile?.clientUpdatedAt),
    };
  }

  private recordPayload(record: any) {
    const createdAt = this.iso(record.createdAtClient ?? record.createdAt) ?? new Date(0).toISOString();
    const updatedAt =
      this.iso(record.clientUpdatedAt ?? record.updatedAt ?? record.createdAtClient ?? record.createdAt) ?? createdAt;
    return {
      id: record.clientRecordId ?? record.id,
      type: this.recordType(record.type),
      transcription: record.transcription ?? '',
      createdAt,
      updatedAt,
      audioUrl: null,
      duration: record.duration ?? null,
      processingMode: this.processingMode(record.processingMode),
      moods: record.moods ?? null,
      needs: record.needs ?? null,
      nvc: record.nvc ?? null,
      title: record.title ?? null,
      summary: record.summary ?? null,
      date: record.date ?? null,
      referencedFragments: record.referencedFragments ?? null,
      weekRange: record.weekRange ?? null,
      referencedRecords: record.referencedRecords ?? null,
      patternFeedback: record.patternFeedback ?? null,
      deletedAt: this.iso(record.deletedAt),
    };
  }

  private recordType(value?: string | null): string {
    return value === 'journal' || value === 'weekly' || value === 'quick_note' ? value : 'quick_note';
  }

  private processingMode(value?: string | null): string | null {
    return value === 'only_record' || value === 'with_mood' || value === 'with_nvc' ? value : null;
  }

  private dailySummaryPayload(item: any) {
    return {
      date: item.dateKey,
      moodWord: item.moodWord,
      oneSentence: item.oneSentence,
      score: item.score,
      recordCount: item.recordCount,
      generatedAt: this.iso(item.generatedAt),
      userOverridden: item.userOverridden,
      clientUpdatedAt: this.iso(item.clientUpdatedAt),
      deletedAt: this.iso(item.deletedAt),
    };
  }

  private dailyMoodPayload(item: any) {
    return {
      date: item.dateKey,
      imagePath: item.imagePath,
      clientUpdatedAt: this.iso(item.clientUpdatedAt),
      deletedAt: this.iso(item.deletedAt),
    };
  }

  private insightReportPayload(item: any) {
    return {
      periodType: item.periodType,
      periodKey: item.periodKey,
      weekRange: item.weekRange ?? null,
      cachedAt: this.iso(item.cachedAt),
      recordCount: item.recordCount ?? null,
      report: item.report,
      clientUpdatedAt: this.iso(item.clientUpdatedAt),
      deletedAt: this.iso(item.deletedAt),
    };
  }

  private weeklyInsightPayload(item: any) {
    return {
      id: item.clientInsightId,
      weekRange: item.weekRange,
      startDate: this.iso(item.startDate),
      endDate: this.iso(item.endDate),
      payload: item.payload,
      clientUpdatedAt: this.iso(item.clientUpdatedAt),
      deletedAt: this.iso(item.deletedAt),
    };
  }

  private parseDate(value?: string | null): Date | null {
    if (!value) return null;
    return new Date(value);
  }

  private iso(value?: Date | string | null): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
}
