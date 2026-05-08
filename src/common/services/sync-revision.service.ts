import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type SyncEntityType =
  | 'profile'
  | 'record'
  | 'daily_summary'
  | 'daily_mood'
  | 'insight_report'
  | 'weekly_insight';

@Injectable()
export class SyncRevisionService {
  constructor(private readonly prisma: PrismaService) {}

  async recordChange(
    userId: string,
    entityType: SyncEntityType,
    entityId: string,
    payload: Record<string, unknown>,
  ) {
    const revision = BigInt(await this.latestRevision(userId)) + 1n;
    await this.prisma.syncChange.create({
      data: {
        userId,
        revision,
        entityType,
        entityId,
        payload: payload as any,
      },
    });
    return revision.toString();
  }

  async latestRevision(userId: string): Promise<string> {
    const latest = await this.prisma.syncChange.findFirst({
      where: { userId },
      orderBy: { revision: 'desc' },
    });
    return latest ? BigInt(latest.revision).toString() : '0';
  }
}
