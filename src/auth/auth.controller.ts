import { Body, Controller, Delete, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto, SmsLoginDto, SmsSendCodeDto } from './dto/auth.dto';
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

  @Post('sms/send-code')
  sendSmsCode(@Body() dto: SmsSendCodeDto, @Req() req: Request) {
    return this.authService.sendSmsCode(dto, this.getRequestMeta(req));
  }

  @Post('sms/login')
  loginWithSms(@Body() dto: SmsLoginDto, @Req() req: Request) {
    return this.authService.loginWithSms(dto, this.getRequestMeta(req));
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

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('account')
  @HttpCode(204)
  deleteAccount(@CurrentUser() user: JwtUser) {
    return this.authService.deleteAccount(user.id);
  }

  private getRequestMeta(req: Request) {
    return {
      userAgent: req.get('user-agent'),
      ipAddress: req.ip,
    };
  }
}
