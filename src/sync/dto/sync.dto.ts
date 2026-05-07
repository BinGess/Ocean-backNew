import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export type RecordTypeDto = 'quick_note' | 'journal' | 'weekly';
export type ProcessingModeDto = 'only_record' | 'with_mood' | 'with_nvc';
export type PeriodTypeDto = 'weekly' | 'monthly';

export class SyncProfileDto {
  @IsOptional()
  @IsString()
  avatar?: string | null;

  @IsOptional()
  @IsString()
  nickname?: string | null;

  @IsOptional()
  @IsString()
  signature?: string | null;

  @IsOptional()
  @IsISO8601()
  clientUpdatedAt?: string;
}

export class SyncRecordDto {
  @IsString()
  id!: string;

  @IsIn(['quick_note', 'journal', 'weekly'])
  type!: RecordTypeDto;

  @IsString()
  transcription!: string;

  @IsISO8601()
  createdAt!: string;

  @IsISO8601()
  updatedAt!: string;

  @IsOptional()
  @IsString()
  audioUrl?: string | null;

  @IsOptional()
  duration?: number | null;

  @IsOptional()
  @IsIn(['only_record', 'with_mood', 'with_nvc'])
  processingMode?: ProcessingModeDto | null;

  @IsOptional()
  @IsArray()
  moods?: string[] | null;

  @IsOptional()
  @IsArray()
  needs?: string[] | null;

  @IsOptional()
  @IsObject()
  nvc?: Record<string, unknown> | null;

  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsString()
  summary?: string | null;

  @IsOptional()
  @IsString()
  date?: string | null;

  @IsOptional()
  @IsArray()
  referencedFragments?: string[] | null;

  @IsOptional()
  @IsString()
  weekRange?: string | null;

  @IsOptional()
  @IsArray()
  referencedRecords?: string[] | null;

  @IsOptional()
  @IsString()
  patternFeedback?: string | null;

  @IsOptional()
  @IsISO8601()
  deletedAt?: string | null;
}

export class SyncDailySummaryDto {
  @IsString()
  date!: string;

  @IsString()
  moodWord!: string;

  @IsString()
  oneSentence!: string;

  @IsInt()
  @Min(0)
  @Max(10)
  score!: number;

  @IsInt()
  @Min(0)
  recordCount!: number;

  @IsISO8601()
  generatedAt!: string;

  @IsBoolean()
  userOverridden!: boolean;

  @IsOptional()
  @IsISO8601()
  clientUpdatedAt?: string;

  @IsOptional()
  @IsISO8601()
  deletedAt?: string | null;
}

export class SyncDailyMoodDto {
  @IsString()
  date!: string;

  @IsString()
  imagePath!: string;

  @IsOptional()
  @IsISO8601()
  clientUpdatedAt?: string;

  @IsOptional()
  @IsISO8601()
  deletedAt?: string | null;
}

export class SyncInsightReportDto {
  @IsIn(['weekly', 'monthly'])
  periodType!: PeriodTypeDto;

  @IsString()
  periodKey!: string;

  @IsOptional()
  @IsString()
  weekRange?: string | null;

  @IsISO8601()
  cachedAt!: string;

  @IsOptional()
  @IsInt()
  recordCount?: number | null;

  @IsObject()
  report!: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  clientUpdatedAt?: string;

  @IsOptional()
  @IsISO8601()
  deletedAt?: string | null;
}

export class SyncWeeklyInsightDto {
  @IsString()
  id!: string;

  @IsString()
  weekRange!: string;

  @IsISO8601()
  startDate!: string;

  @IsISO8601()
  endDate!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  clientUpdatedAt?: string;

  @IsOptional()
  @IsISO8601()
  deletedAt?: string | null;
}

export class SyncPushDto {
  @ApiPropertyOptional()
  @IsOptional()
  profile?: SyncProfileDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  records?: SyncRecordDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  dailySummaries?: SyncDailySummaryDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  dailyMoods?: SyncDailyMoodDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  insightReports?: SyncInsightReportDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  weeklyInsights?: SyncWeeklyInsightDto[];
}
