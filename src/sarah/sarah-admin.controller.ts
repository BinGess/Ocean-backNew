import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InternalGuard } from '../common/guards/internal.guard';
import { GenerateWeeklyInternalDto } from './dto/sarah-letter.dto';
import { SarahSchedulerService } from './sarah-scheduler.service';
import { SarahService } from './sarah.service';

/**
 * 内部管理接口，仅服务端运维调用。
 * 鉴权：请求 Header 需携带 X-Internal-Token: <SARAH_INTERNAL_TOKEN>
 * 客户端不应调用此 Controller 下的任何接口。
 */
@ApiTags('sarah-admin')
@UseGuards(InternalGuard)
@Controller('sarah/admin')
export class SarahAdminController {
  constructor(
    private readonly sarahService: SarahService,
    private readonly sarahSchedulerService: SarahSchedulerService,
  ) {}

  /**
   * 手动执行本周 Sarah 信件批量生成任务，效果等同于 Cron 自动触发。
   * 适用场景：Cron 错过触发、服务器重启导致任务未执行时补跑。
   * 操作幂等：已生成过的用户会自动跳过，不会重复生成。
   */
  @Post('trigger-weekly-cron')
  @HttpCode(200)
  async triggerWeeklyCron() {
    await this.sarahSchedulerService.generateWeeklyLetters();
    return { ok: true };
  }

  /**
   * 为单个指定用户补发指定周的周报。
   * 适用场景：某用户因异常未收到周报时单独补发。
   */
  @Post('generate-weekly')
  @HttpCode(200)
  async generateWeeklyForUser(@Body() dto: GenerateWeeklyInternalDto) {
    return this.sarahService.generateWeeklyInternal(dto);
  }

  /**
   * 历史补全：扫描所有用户的 record 记录，按自然周（北京时间）批量生成历史 Sarah 信件。
   * 补全完成后自动执行去重（同一周存在 legacy + weekly 时保留 weekly，软删 legacy）。
   * 接口立即返回，补全任务在后台异步执行，进度通过服务日志查看。
   * 操作完全幂等：已生成的周自动跳过，当前未结束的周不处理。
   */
  @Post('backfill-historical')
  @HttpCode(200)
  async backfillHistorical() {
    this.sarahSchedulerService.backfillHistoricalLetters().catch(() => {});
    return { ok: true, message: '历史补全任务已在后台启动，请通过服务日志查看进度' };
  }

  /**
   * 单独执行去重：同步返回去重结果。
   * 适用场景：单独补发某用户后手动触发去重，无需重跑整个 backfill。
   */
  @Post('dedup-historical')
  @HttpCode(200)
  async dedupHistorical() {
    return this.sarahSchedulerService.deduplicateHistoricalLetters();
  }
}
