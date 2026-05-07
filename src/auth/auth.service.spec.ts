import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { PasswordService } from './password.service';
import { InMemoryPrismaService } from '../testing/in-memory-prisma.service';

describe('AuthService', () => {
  let prisma: InMemoryPrismaService;
  let service: AuthService;

  beforeEach(() => {
    prisma = new InMemoryPrismaService();
    service = new AuthService(
      prisma as any,
      new PasswordService(),
      new TokenService('access-secret', 'refresh-secret'),
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
});
