import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, JwtUser } from '../common/guards/jwt-auth.guard';
import { PeriodTypeDto } from '../sync/dto/sync.dto';
import { UpsertReportDto } from './dto/report.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Put(':periodType/:periodKey')
  upsert(
    @CurrentUser() user: JwtUser,
    @Param('periodType') periodType: PeriodTypeDto,
    @Param('periodKey') periodKey: string,
    @Body() dto: UpsertReportDto,
  ) {
    return this.reportsService.upsert(user.id, periodType, periodKey, dto);
  }
}
