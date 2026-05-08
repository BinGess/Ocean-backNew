import { Injectable } from '@nestjs/common';
import { PeriodTypeDto } from '../sync/dto/sync.dto';
import { SyncRevisionService } from '../common/services/sync-revision.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertReportDto } from './dto/report.dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revisions: SyncRevisionService,
  ) {}

  async upsert(userId: string, periodType: PeriodTypeDto, periodKey: string, dto: UpsertReportDto) {
    const clientUpdatedAt = dto.clientUpdatedAt ? new Date(dto.clientUpdatedAt) : new Date(dto.cachedAt);
    const existing = await this.prisma.insightReport.findFirst({
      where: { userId, periodType, periodKey },
    });
    const data = {
      userId,
      periodType,
      periodKey,
      weekRange: dto.weekRange ?? null,
      cachedAt: new Date(dto.cachedAt),
      recordCount: dto.recordCount ?? null,
      report: dto.report,
      clientUpdatedAt,
      deletedAt: null,
    };
    const item = existing
      ? await this.prisma.insightReport.update({ where: { id: existing.id }, data: data as any })
      : await this.prisma.insightReport.create({ data: data as any });
    const payload = this.reportPayload(item);
    const revision = await this.revisions.recordChange(
      userId,
      'insight_report',
      `${periodType}:${periodKey}`,
      payload,
    );
    return { revision, data: payload };
  }

  private reportPayload(item: any) {
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

  private iso(value?: Date | null): string | null {
    return value ? value.toISOString() : null;
  }
}
