import { NotFoundException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertRecordDto } from './dto/record.dto';

@Injectable()
export class RecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const records = await this.prisma.record.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAtClient: 'desc' },
    });
    return {
      cursor: await this.latestRevision(userId),
      data: records.map((record) => this.recordPayload(record)),
    };
  }

  async create(userId: string, dto: UpsertRecordDto) {
    return this.upsert(userId, dto.id, dto);
  }

  async update(userId: string, id: string, dto: UpsertRecordDto) {
    return this.upsert(userId, id, { ...dto, id });
  }

  async delete(userId: string, id: string) {
    const existing = await this.prisma.record.findFirst({
      where: { userId, clientRecordId: id },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Record not found');
    }

    const deletedAt = new Date();
    const record = await this.prisma.record.update({
      where: { id: existing.id },
      data: {
        clientUpdatedAt: deletedAt,
        deletedAt,
      } as any,
    });
    const payload = this.recordPayload(record);
    const revision = await this.recordChange(userId, id, payload);
    return { revision, data: payload };
  }

  private async upsert(userId: string, id: string, dto: UpsertRecordDto) {
    const existing = await this.prisma.record.findFirst({
      where: { userId, clientRecordId: id },
    });
    const hasDeepAnalyses = Object.prototype.hasOwnProperty.call(dto, 'deepAnalyses');
    const data = {
      userId,
      clientRecordId: id,
      type: dto.type,
      transcription: dto.transcription,
      createdAtClient: new Date(dto.createdAt),
      clientUpdatedAt: new Date(dto.updatedAt),
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
      deepAnalyses: hasDeepAnalyses ? (dto.deepAnalyses ?? null) : (existing?.deepAnalyses ?? null),
      deletedAt: null,
    };

    const record = existing
      ? await this.prisma.record.update({
          where: { id: existing.id },
          data: data as any,
        })
      : await this.prisma.record.create({ data: data as any });
    const payload = this.recordPayload(record);
    const revision = await this.recordChange(userId, id, payload);
    return { revision, data: payload };
  }

  private async recordChange(userId: string, entityId: string, payload: Record<string, unknown>) {
    const revision = BigInt(await this.latestRevision(userId)) + 1n;
    await this.prisma.syncChange.create({
      data: {
        userId,
        revision,
        entityType: 'record',
        entityId,
        payload: payload as any,
      },
    });
    return revision.toString();
  }

  private async latestRevision(userId: string): Promise<string> {
    const latest = await this.prisma.syncChange.findFirst({
      where: { userId },
      orderBy: { revision: 'desc' },
    });
    return latest ? BigInt(latest.revision).toString() : '0';
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
      deepAnalyses: Array.isArray(record.deepAnalyses) ? record.deepAnalyses : [],
      deletedAt: this.iso(record.deletedAt),
    };
  }

  private recordType(value?: string | null): string {
    return value === 'journal' || value === 'weekly' || value === 'quick_note' ? value : 'quick_note';
  }

  private processingMode(value?: string | null): string | null {
    return value === 'only_record' || value === 'with_mood' || value === 'with_nvc' ? value : null;
  }

  private iso(value?: Date | string | null): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
}
