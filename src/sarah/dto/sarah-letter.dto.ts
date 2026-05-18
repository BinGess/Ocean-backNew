import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export type SarahLetterTypeDto = 'weekly' | 'welcome' | 'legacy';

export class SarahLetterDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsIn(['weekly', 'welcome', 'legacy'])
  type!: SarahLetterTypeDto;

  @IsISO8601()
  createdAt!: string;

  @IsOptional()
  @IsISO8601()
  weekStart?: string | null;

  @IsOptional()
  @IsISO8601()
  weekEnd?: string | null;

  @IsString()
  content!: string;

  @IsString()
  previewText!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  illustrationIndex!: number;

  @IsBoolean()
  isRead!: boolean;

  @IsISO8601()
  updatedAt!: string;

  @IsOptional()
  @IsString()
  sourceLegacyReportId?: string | null;

  @IsOptional()
  @IsISO8601()
  deletedAt?: string | null;
}

export class MigrateLegacyLettersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SarahLetterDto)
  letters!: SarahLetterDto[];
}

export class GenerateWeeklySarahLetterDto {
  @IsISO8601()
  weekStart!: string;

  @IsISO8601()
  weekEnd!: string;
}

export class PatchSarahLetterDto {
  @IsBoolean()
  isRead!: boolean;
}
