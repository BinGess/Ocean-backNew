import { Injectable } from '@nestjs/common';
import { SyncRevisionService } from '../common/services/sync-revision.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateDailyMoodDto, UpdateDailySummaryDto } from './dto/daily.dto';

@Injectable()
export class DailyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revisions: SyncRevisionService,
  ) {}

  async updateMood(userId: string, date: string, dto: UpdateDailyMoodDto) {
    const clientUpdatedAt = dto.clientUpdatedAt ? new Date(dto.clientUpdatedAt) : new Date();
    const existing = await this.prisma.dailyMood.findFirst({ where: { userId, dateKey: date } });
    const item = existing
      ? await this.prisma.dailyMood.update({
          where: { id: existing.id },
          data: {
            imagePath: dto.imagePath,
            clientUpdatedAt,
            deletedAt: null,
          },
        })
      : await this.prisma.dailyMood.create({
          data: {
            userId,
            dateKey: date,
            imagePath: dto.imagePath,
            clientUpdatedAt,
            deletedAt: null,
          },
        });
    const payload = this.dailyMoodPayload(item);
    const revision = await this.revisions.recordChange(userId, 'daily_mood', date, payload);
    return { revision, data: payload };
  }

  async updateSummary(userId: string, date: string, dto: UpdateDailySummaryDto) {
    const clientUpdatedAt = dto.clientUpdatedAt ? new Date(dto.clientUpdatedAt) : new Date(dto.generatedAt);
    const existing = await this.prisma.dailySummary.findFirst({ where: { userId, dateKey: date } });
    const data = {
      userId,
      dateKey: date,
      moodWord: dto.moodWord,
      oneSentence: dto.oneSentence,
      score: dto.score,
      recordCount: dto.recordCount,
      generatedAt: new Date(dto.generatedAt),
      userOverridden: dto.userOverridden,
      clientUpdatedAt,
      deletedAt: null,
    };
    const item = existing
      ? await this.prisma.dailySummary.update({ where: { id: existing.id }, data })
      : await this.prisma.dailySummary.create({ data });
    const payload = this.dailySummaryPayload(item);
    const revision = await this.revisions.recordChange(userId, 'daily_summary', date, payload);
    return { revision, data: payload };
  }

  private dailyMoodPayload(item: any) {
    return {
      date: item.dateKey,
      imagePath: item.imagePath,
      clientUpdatedAt: this.iso(item.clientUpdatedAt),
      deletedAt: this.iso(item.deletedAt),
    };
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

  private iso(value?: Date | null): string | null {
    return value ? value.toISOString() : null;
  }
}
