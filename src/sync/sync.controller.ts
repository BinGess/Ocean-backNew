import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, JwtUser } from '../common/guards/jwt-auth.guard';
import { SyncPushDto } from './dto/sync.dto';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('snapshot')
  snapshot(@CurrentUser() user: JwtUser) {
    return this.syncService.snapshot(user.id);
  }

  @Post('push')
  push(@CurrentUser() user: JwtUser, @Body() dto: SyncPushDto) {
    return this.syncService.push(user.id, dto);
  }

  @Get('pull')
  pull(@CurrentUser() user: JwtUser, @Query('cursor') cursor = '0') {
    return this.syncService.pull(user.id, cursor);
  }
}
