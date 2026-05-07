import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';
import { PasswordService } from './password.service';
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
    if (!user || user.status === 'disabled') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordOk = await this.passwordService.verify(user.passwordHash, dto.password);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
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
        email: user?.email,
        nickname: profile?.nickname ?? null,
      },
    };
  }

  hashTokenForDebug(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
