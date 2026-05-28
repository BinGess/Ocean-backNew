import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 注册或更新设备 Token。
   * 同一 token 重复上报时只更新 updatedAt，不重复插入。
   */
  async upsertToken(userId: string, token: string, platform: string): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, updatedAt: new Date() },
    });
  }

  /**
   * 获取某用户的所有有效设备 Token（按 platform 过滤）。
   */
  async getTokensByUser(userId: string, platform?: string): Promise<string[]> {
    const rows = await this.prisma.deviceToken.findMany({
      where: { userId, ...(platform ? { platform } : {}) },
      select: { token: true },
    });
    return rows.map((r) => r.token);
  }

  /**
   * 删除已失效的设备 Token（APNs 返回 410 时调用）。
   */
  async removeToken(token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { token } });
  }
}
