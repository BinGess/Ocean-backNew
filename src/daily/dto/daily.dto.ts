import { IsBoolean, IsISO8601, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateDailyMoodDto {
  @IsString()
  imagePath!: string;

  @IsOptional()
  @IsISO8601()
  clientUpdatedAt?: string;
}

export class UpdateDailySummaryDto {
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
}
