import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SmsRateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanSend(phoneHash: string, ipAddress?: string): Promise<void> {
    const now = Date.now();
    const intervalSeconds = Number(process.env.ALIYUN_SMS_INTERVAL_SECONDS ?? '60');
    const recent = await this.prisma.smsLoginAttempt.count({
      where: {
        phoneHash,
        sentAt: { gt: new Date(now - intervalSeconds * 1000) },
      } as any,
    });
    if (recent > 0) {
      throw this.tooManyRequests(`验证码发送过于频繁，请 ${intervalSeconds} 秒后再试`);
    }

    const hourly = await this.prisma.smsLoginAttempt.count({
      where: {
        phoneHash,
        sentAt: { gt: new Date(now - 60 * 60 * 1000) },
      } as any,
    });
    if (hourly >= Number(process.env.SMS_PHONE_HOURLY_LIMIT ?? '5')) {
      throw this.tooManyRequests('验证码发送过于频繁，请稍后再试');
    }

    const daily = await this.prisma.smsLoginAttempt.count({
      where: {
        phoneHash,
        sentAt: { gt: new Date(now - 24 * 60 * 60 * 1000) },
      } as any,
    });
    if (daily >= Number(process.env.SMS_PHONE_DAILY_LIMIT ?? '10')) {
      throw this.tooManyRequests('验证码发送过于频繁，请明天再试');
    }

    if (ipAddress) {
      const ipHourly = await this.prisma.smsLoginAttempt.count({
        where: {
          ipAddress,
          sentAt: { gt: new Date(now - 60 * 60 * 1000) },
        } as any,
      });
      if (ipHourly >= Number(process.env.SMS_IP_HOURLY_LIMIT ?? '20')) {
        throw this.tooManyRequests('验证码发送过于频繁，请稍后再试');
      }
    }
  }

  private tooManyRequests(message: string): HttpException {
    return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
