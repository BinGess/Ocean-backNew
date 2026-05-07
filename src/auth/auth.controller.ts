import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, JwtUser } from '../common/guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, this.getRequestMeta(req));
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, this.getRequestMeta(req));
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.authService.refresh(dto, this.getRequestMeta(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Body() dto: RefreshDto, @CurrentUser() _user: JwtUser) {
    return this.authService.logout(dto.refreshToken);
  }

  private getRequestMeta(req: Request) {
    return {
      userAgent: req.get('user-agent'),
      ipAddress: req.ip,
    };
  }
}
