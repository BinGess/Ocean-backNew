import { Injectable } from '@nestjs/common';
import { SyncRevisionService } from '../common/services/sync-revision.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/profile.dto';

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revisions: SyncRevisionService,
  ) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    return {
      avatar: profile?.avatar ?? null,
      nickname: profile?.nickname ?? null,
      signature: profile?.signature ?? null,
      clientUpdatedAt: profile?.clientUpdatedAt?.toISOString?.() ?? null,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const clientUpdatedAt = dto.clientUpdatedAt ? new Date(dto.clientUpdatedAt) : new Date();
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
    const payload = {
      avatar: profile.avatar ?? null,
      nickname: profile.nickname ?? null,
      signature: profile.signature ?? null,
      clientUpdatedAt: profile.clientUpdatedAt.toISOString(),
    };
    const revision = await this.revisions.recordChange(userId, 'profile', userId, payload);
    return { revision, data: payload };
  }
}
