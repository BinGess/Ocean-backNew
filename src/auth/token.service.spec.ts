import { UnauthorizedException } from '@nestjs/common';
import { TokenService } from './token.service';

describe('TokenService', () => {
  const originalAccessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN;

  afterEach(() => {
    if (originalAccessExpiresIn === undefined) {
      delete process.env.JWT_ACCESS_EXPIRES_IN;
    } else {
      process.env.JWT_ACCESS_EXPIRES_IN = originalAccessExpiresIn;
    }
  });

  it('converts expired access tokens into UnauthorizedException', () => {
    process.env.JWT_ACCESS_EXPIRES_IN = '0s';
    const service = new TokenService('access-secret', 'refresh-secret');
    const token = service.signAccess('user-1');

    expect(() => service.verifyAccess(token)).toThrow(UnauthorizedException);
  });
});
