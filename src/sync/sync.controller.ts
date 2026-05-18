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
  async snapshot(@CurrentUser() user: JwtUser) {
    const result = await this.syncService.snapshot(user.id);
    console.log('[SarahDebug] GET /sync/snapshot', {
      userId: user.id,
      records: result.records?.length ?? 0,
      insightReports: result.insightReports?.length ?? 0,
      weeklyInsights: result.weeklyInsights?.length ?? 0,
    });
    return result;
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
