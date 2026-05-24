import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, JwtUser } from '../common/guards/jwt-auth.guard';
import { AnalysisService } from './analysis.service';
import { EmotionTrendQuery, WeeklyAnalysisQuery } from './dto/analysis.dto';

@ApiTags('analysis')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  /** 获取指定周的情绪分析汇总 */
  @Get('weekly')
  getWeekly(@CurrentUser() user: JwtUser, @Query() query: WeeklyAnalysisQuery) {
    return this.analysisService.getWeekly(user.id, query);
  }

  /** 获取情绪与需求长期趋势（支持日 / 周 / 月粒度） */
  @Get('emotion-trend')
  getEmotionTrend(@CurrentUser() user: JwtUser, @Query() query: EmotionTrendQuery) {
    return this.analysisService.getEmotionTrend(user.id, query);
  }
}
