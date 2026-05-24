import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class WeeklyAnalysisQuery {
  /** ISO 周格式，如 2026-W21。与 start_date/end_date 三选一 */
  @IsOptional()
  @IsString()
  week?: string;

  /** 周起始日期，如 2026-05-18 */
  @IsOptional()
  @IsString()
  start_date?: string;

  /** 周结束日期，如 2026-05-24（含） */
  @IsOptional()
  @IsString()
  end_date?: string;
}

export class EmotionTrendQuery {
  /** 开始日期，如 2026-04-01 */
  @IsString()
  start_date!: string;

  /** 结束日期，如 2026-05-23（含） */
  @IsString()
  end_date!: string;

  /** 粒度：day / week / month，默认 week */
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  granularity?: 'day' | 'week' | 'month';

  /** 返回频率最高的前 N 个情绪/需求，默认 5 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  top_n?: number;
}
