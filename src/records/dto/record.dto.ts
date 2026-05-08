import {
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { ProcessingModeDto, RecordTypeDto } from '../../sync/dto/sync.dto';

export class UpsertRecordDto {
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
}
