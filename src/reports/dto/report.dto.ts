import { IsISO8601, IsInt, IsObject, IsOptional, IsString } from 'class-validator';

export class UpsertReportDto {
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
}
