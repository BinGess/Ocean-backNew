import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { LoginDto, RefreshDto, RegisterDto, SmsLoginDto, SmsSendCodeDto } from './dto/auth.dto';
import { PasswordService } from './password.service';
import { PhoneNumberService } from './phone-number.service';
import { SmsRateLimitService } from './sms-rate-limit.service';
import { SMS_PROVIDER, SmsProvider } from './sms.provider';
import { TokenService } from './token.service';
import { PrismaService } from '../prisma/prisma.service';

interface AuthContext {
  deviceId?: string;
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    @Inject(SMS_PROVIDER)
    private readonly smsProvider: SmsProvider,
    private readonly phoneNumberService: PhoneNumberService,
    private readonly smsRateLimitService: SmsRateLimitService,
  ) {}

  async register(dto: RegisterDto, context: AuthContext = {}) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        profile: {
          create: {
            nickname: dto.nickname?.trim() || null,
            avatar: null,
            signature: null,
          },
        },
      },
    });

    return this.issueTokens(user.id, context);
  }

  async login(dto: LoginDto, context: AuthContext = {}) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status === 'disabled' || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordOk = await this.passwordService.verify(user.passwordHash, dto.password);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokens(user.id, context);
  }

  async sendSmsCode(dto: SmsSendCodeDto, context: AuthContext = {}) {
    const phone = this.phoneNumberService.normalize(dto.phone);
    if (this.isAppReviewPhone(phone.hash)) {
      await this.prisma.smsLoginAttempt.create({
        data: {
          phoneHash: phone.hash,
          scene: 'login',
          ipAddress: context.ipAddress,
          deviceId: context.deviceId,
          aliRequestId: 'app-review',
          aliBizId: null,
        },
      });
      return {
        success: true,
        cooldownSeconds: Number(process.env.ALIYUN_SMS_INTERVAL_SECONDS ?? '60'),
      };
    }

    await this.smsRateLimitService.assertCanSend(phone.hash, context.ipAddress);
    const outId = this.tokenService.randomTokenId();
    const sent = await this.smsProvider.sendCode(phone.nationalNumber, outId);
    await this.prisma.smsLoginAttempt.create({
      data: {
        phoneHash: phone.hash,
        scene: 'login',
        ipAddress: context.ipAddress,
        deviceId: context.deviceId,
        aliRequestId: sent.requestId,
        aliBizId: sent.bizId,
      },
    });
    return {
      success: true,
      cooldownSeconds: Number(process.env.ALIYUN_SMS_INTERVAL_SECONDS ?? '60'),
    };
  }

  async loginWithSms(dto: SmsLoginDto, context: AuthContext = {}) {
    const phone = this.phoneNumberService.normalize(dto.phone);
    const verified =
      this.isAppReviewCode(phone.hash, dto.code) ||
      (await this.smsProvider.checkCode(phone.nationalNumber, dto.code));
    if (!verified) {
      throw new UnauthorizedException('Invalid SMS verification code');
    }

    let user = await this.prisma.user.findUnique({ where: { phoneNumberHash: phone.hash } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: null,
          passwordHash: null,
          phoneCountryCode: phone.countryCode,
          phoneNumberHash: phone.hash,
          phoneNumberEnc: phone.encrypted,
          phoneVerifiedAt: new Date(),
          profile: {
            create: {
              nickname: null,
              avatar: null,
              signature: null,
            },
          },
        } as any,
      });
    } else if (user.status === 'disabled') {
      throw new UnauthorizedException('Invalid credentials');
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          phoneCountryCode: phone.countryCode,
          phoneNumberEnc: phone.encrypted,
          phoneVerifiedAt: new Date(),
        } as any,
      });
    }

    return this.issueTokens(user.id, context);
  }

  async refresh(dto: RefreshDto, context: AuthContext = {}) {
    const payload = this.tokenService.verifyRefresh(dto.refreshToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { id: payload.sessionId },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenOk = await this.passwordService.verify(session.tokenHash, dto.refreshToken);
    if (!tokenOk) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(payload.sub, context);
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.prisma.user.delete({ where: { id: userId } });
  }

  async logout(refreshToken: string): Promise<void> {
    const payload = this.tokenService.verifyRefresh(refreshToken);
    await this.prisma.refreshSession.update({
      where: { id: payload.sessionId },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(userId: string, context: AuthContext) {
    const sessionId = this.tokenService.randomTokenId();
    const accessToken = this.tokenService.signAccess(userId);
    const refreshToken = this.tokenService.signRefresh(userId, sessionId);
    const refreshDays = Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS ?? 30);
    const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId,
        tokenHash: await this.passwordService.hash(refreshToken),
        deviceId: context.deviceId,
        deviceName: context.deviceName,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        expiresAt,
      },
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });

    return {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        email: user?.email ?? null,
        phone: this.phoneNumberService.maskStored(user?.phoneNumberEnc),
        nickname: profile?.nickname ?? null,
      },
    };
  }

  hashTokenForDebug(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private isAppReviewCode(phoneHash: string, code: string): boolean {
    const reviewCode = process.env.APP_REVIEW_SMS_CODE?.trim();
    if (!reviewCode || !/^\d{4,8}$/.test(reviewCode)) return false;
    return this.isAppReviewPhone(phoneHash) && code === reviewCode;
  }

  private isAppReviewPhone(phoneHash: string): boolean {
    const reviewPhone = process.env.APP_REVIEW_SMS_PHONE?.trim();
    if (!reviewPhone) return false;

    try {
      return this.phoneNumberService.normalize(reviewPhone).hash === phoneHash;
    } catch {
      return false;
    }
  }
}
