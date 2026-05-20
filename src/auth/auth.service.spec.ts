import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { PasswordService } from './password.service';
import { PhoneNumberService } from './phone-number.service';
import { SmsRateLimitService } from './sms-rate-limit.service';
import { SmsProvider } from './sms.provider';
import { InMemoryPrismaService } from '../testing/in-memory-prisma.service';

describe('AuthService', () => {
  let prisma: InMemoryPrismaService;
  let service: AuthService;
  let smsProvider: _FakeSmsProvider;

  beforeEach(() => {
    delete process.env.APP_REVIEW_SMS_PHONE;
    delete process.env.APP_REVIEW_SMS_CODE;
    prisma = new InMemoryPrismaService();
    smsProvider = new _FakeSmsProvider();
    service = new AuthService(
      prisma as any,
      new PasswordService(),
      new TokenService('access-secret', 'refresh-secret'),
      smsProvider,
      new PhoneNumberService(),
      new SmsRateLimitService(prisma as any),
    );
  });

  it('registers a user with a hashed password and default profile', async () => {
    const result = await service.register({
      email: 'USER@example.com',
      password: 'StrongerPass123',
      nickname: 'Ocean',
    });

    expect(result.user.email).toBe('user@example.com');
    expect(result.user.nickname).toBe('Ocean');
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    const stored = await prisma.user.findUnique({ where: { email: 'user@example.com' } });
    expect(stored?.passwordHash).not.toBe('StrongerPass123');
    expect(await new PasswordService().verify(stored!.passwordHash, 'StrongerPass123')).toBe(true);
  });

  it('logs in and rejects wrong passwords', async () => {
    await service.register({
      email: 'user@example.com',
      password: 'StrongerPass123',
    });

    await expect(
      service.login({ email: 'user@example.com', password: 'bad-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const login = await service.login({
      email: 'USER@example.com',
      password: 'StrongerPass123',
    });
    expect(login.refreshToken).toEqual(expect.any(String));
  });

  it('rotates refresh tokens and revokes the consumed session', async () => {
    const registered = await service.register({
      email: 'user@example.com',
      password: 'StrongerPass123',
    });

    const refreshed = await service.refresh({ refreshToken: registered.refreshToken });

    expect(refreshed.refreshToken).not.toBe(registered.refreshToken);
    expect(prisma.refreshSessions[0].revokedAt).toBeInstanceOf(Date);
    await expect(service.refresh({ refreshToken: registered.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('sends SMS code and logs in with verified phone', async () => {
    await service.sendSmsCode({ phone: '13800138000' });

    expect(prisma.smsLoginAttempts).toHaveLength(1);
    const result = await service.loginWithSms({
      phone: '13800138000',
      code: '123456',
    });

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.user.phone).toBe('138****8000');
    expect(prisma.users).toHaveLength(1);

    const secondLogin = await service.loginWithSms({
      phone: '+8613800138000',
      code: '123456',
    });

    expect(secondLogin.user.id).toBe(result.user.id);
    expect(prisma.users).toHaveLength(1);
  });

  it('rejects wrong SMS verification codes', async () => {
    await expect(
      service.loginWithSms({ phone: '13800138000', code: '000000' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lets the configured App Review phone log in with a fixed code without contacting SMS provider', async () => {
    process.env.APP_REVIEW_SMS_PHONE = '13900139000';
    process.env.APP_REVIEW_SMS_CODE = '654321';

    await service.sendSmsCode({ phone: '+8613900139000' });

    expect(smsProvider.sentCodes).toBe(0);
    expect(prisma.smsLoginAttempts[0].aliRequestId).toBe('app-review');

    const result = await service.loginWithSms({
      phone: '13900139000',
      code: '654321',
    });

    expect(smsProvider.checkedCodes).toBe(0);
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.user.phone).toBe('139****9000');
  });
});

class _FakeSmsProvider implements SmsProvider {
  sentCodes = 0;
  checkedCodes = 0;

  async sendCode(): Promise<{ requestId: string; bizId: string }> {
    this.sentCodes += 1;
    return { requestId: 'aliyun-request', bizId: 'aliyun-biz' };
  }

  async checkCode(_phoneNumber: string, code: string): Promise<boolean> {
    this.checkedCodes += 1;
    return code === '123456';
  }
}
