import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, JwtUser } from '../common/guards/jwt-auth.guard';
import { DevicesService } from './devices.service';
import { RegisterTokenDto } from './dto/register-token.dto';

@ApiTags('devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  /**
   * 注册或更新设备推送 Token。
   * 客户端每次启动时上报最新 Token，服务端自动去重。
   */
  @Post('token')
  @HttpCode(200)
  async registerToken(@CurrentUser() user: JwtUser, @Body() dto: RegisterTokenDto) {
    await this.devicesService.upsertToken(user.id, dto.token, dto.platform);
    return { success: true };
  }
}
