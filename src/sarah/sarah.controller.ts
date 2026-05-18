import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, JwtUser } from '../common/guards/jwt-auth.guard';
import {
  GenerateWeeklySarahLetterDto,
  MigrateLegacyLettersDto,
  PatchSarahLetterDto,
} from './dto/sarah-letter.dto';
import { SarahService } from './sarah.service';

@ApiTags('sarah')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sarah/letters')
export class SarahController {
  constructor(private readonly sarahService: SarahService) {}

  @Get()
  async list(@CurrentUser() user: JwtUser) {
    const result = await this.sarahService.list(user.id);
    console.log('[SarahDebug] GET /sarah/letters', {
      userId: user.id,
      letters: result.letters?.length ?? 0,
      types: result.letters?.map((letter) => letter.type) ?? [],
    });
    return result;
  }

  @Post('welcome')
  @HttpCode(200)
  welcome(@CurrentUser() user: JwtUser) {
    return this.sarahService.welcome(user.id);
  }

  @Post('migrate-legacy')
  @HttpCode(200)
  async migrateLegacy(@CurrentUser() user: JwtUser, @Body() dto: MigrateLegacyLettersDto) {
    console.log('[SarahDebug] POST /sarah/letters/migrate-legacy request', {
      userId: user.id,
      letters: dto.letters?.length ?? 0,
      types: dto.letters?.map((letter) => letter.type) ?? [],
      sourceLegacyReportIds: dto.letters?.map((letter) => letter.sourceLegacyReportId ?? null) ?? [],
    });

    const result = await this.sarahService.migrateLegacy(user.id, dto.letters);
    console.log('[SarahDebug] POST /sarah/letters/migrate-legacy response', {
      userId: user.id,
      letters: result.letters?.length ?? 0,
      types: result.letters?.map((letter) => letter.type) ?? [],
    });
    return result;
  }

  @Post('generate-weekly')
  @HttpCode(200)
  generateWeekly(@CurrentUser() user: JwtUser, @Body() dto: GenerateWeeklySarahLetterDto) {
    return this.sarahService.generateWeekly(user.id, dto);
  }

  @Patch(':id')
  patch(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: PatchSarahLetterDto) {
    return this.sarahService.patch(user.id, id, dto);
  }
}
