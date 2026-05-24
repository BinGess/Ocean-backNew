import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * 仅内部调用可通过的 Guard。
 * 客户端请求需携带 Header：X-Internal-Token: <SARAH_INTERNAL_TOKEN 环境变量值>
 * 若环境变量未设置，所有请求均被拒绝（避免裸奔到生产环境）。
 */
@Injectable()
export class InternalGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('SARAH_INTERNAL_TOKEN');
    if (!expected) {
      throw new UnauthorizedException('Internal endpoint is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-internal-token'];

    if (!provided || provided !== expected) {
      throw new UnauthorizedException('Invalid internal token');
    }

    return true;
  }
}
