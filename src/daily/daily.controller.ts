import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, JwtUser } from '../common/guards/jwt-auth.guard';
import { DailyService } from './daily.service';
import { UpdateDailyMoodDto, UpdateDailySummaryDto } from './dto/daily.dto';

@ApiTags('daily')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('daily')
export class DailyController {
  constructor(private readonly dailyService: DailyService) {}

  @Put(':date/mood')
  updateMood(
    @CurrentUser() user: JwtUser,
    @Param('date') date: string,
    @Body() dto: UpdateDailyMoodDto,
  ) {
    return this.dailyService.updateMood(user.id, date, dto);
  }

  @Put(':date/summary')
  updateSummary(
    @CurrentUser() user: JwtUser,
    @Param('date') date: string,
    @Body() dto: UpdateDailySummaryDto,
  ) {
    return this.dailyService.updateSummary(user.id, date, dto);
  }
}
