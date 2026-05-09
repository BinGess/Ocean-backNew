import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';

export interface TokenPayload {
  sub: string;
  sessionId?: string;
  type: 'access' | 'refresh';
}

@Injectable()
export class TokenService {
  private readonly accessJwt: JwtService;
  private readonly refreshJwt: JwtService;

  constructor(
    accessSecret = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    refreshSecret = process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
  ) {
    this.accessJwt = new JwtService({
      secret: accessSecret,
      signOptions: { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m' },
    });
    this.refreshJwt = new JwtService({
      secret: refreshSecret,
      signOptions: { expiresIn: `${process.env.JWT_REFRESH_EXPIRES_IN_DAYS ?? '30'}d` },
    });
  }

  signAccess(userId: string): string {
    return this.accessJwt.sign({ sub: userId, type: 'access' });
  }

  signRefresh(userId: string, sessionId: string): string {
    return this.refreshJwt.sign({ sub: userId, sessionId, type: 'refresh' });
  }

  verifyAccess(token: string): TokenPayload {
    const payload = this.verifyJwt(this.accessJwt, token, 'Invalid access token');
    if (payload.type !== 'access') throw new UnauthorizedException('Invalid access token');
    return payload;
  }

  verifyRefresh(token: string): TokenPayload {
    const payload = this.verifyJwt(this.refreshJwt, token, 'Invalid refresh token');
    if (payload.type !== 'refresh' || !payload.sessionId) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return payload;
  }

  private verifyJwt(jwt: JwtService, token: string, message: string): TokenPayload {
    try {
      return jwt.verify<TokenPayload>(token);
    } catch {
      throw new UnauthorizedException(message);
    }
  }

  randomTokenId(): string {
    return randomBytes(16).toString('hex');
  }
}
