import { Body, Controller, Headers, Ip, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, JwtUser } from '../common/guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Headers('user-agent') userAgent?: string, @Ip() ipAddress?: string) {
    return this.authService.register(dto, { userAgent, ipAddress });
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Headers('user-agent') userAgent?: string, @Ip() ipAddress?: string) {
    return this.authService.login(dto, { userAgent, ipAddress });
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Headers('user-agent') userAgent?: string, @Ip() ipAddress?: string) {
    return this.authService.refresh(dto, { userAgent, ipAddress });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Body() dto: RefreshDto, @CurrentUser() _user: JwtUser) {
    return this.authService.logout(dto.refreshToken);
  }
}
