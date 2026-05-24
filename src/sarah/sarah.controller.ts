import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InternalGuard } from '../common/guards/internal.guard';
import { JwtAuthGuard, JwtUser } from '../common/guards/jwt-auth.guard';
import { sarahDebugLog } from '../common/utils/sarah-debug-log';
import {
  GenerateWeeklyInternalDto,
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
    sarahDebugLog('GET /sarah/letters result', {
      userId: user.id,
      letters: result.letters?.length ?? 0,
      types: result.letters?.map((letter) => letter.type) ?? [],
    });
    return result;
  }

  @Post('welcome')
  @HttpCode(200)
  async welcome(@CurrentUser() user: JwtUser) {
    const result = await this.sarahService.welcome(user.id);
    sarahDebugLog('POST /sarah/letters/welcome result', {
      userId: user.id,
      letterId: result.letter?.id ?? null,
      type: result.letter?.type ?? null,
    });
    return result;
  }

  @Post('migrate-legacy')
  @HttpCode(200)
  async migrateLegacy(@CurrentUser() user: JwtUser, @Body() dto: MigrateLegacyLettersDto) {
    sarahDebugLog('POST /sarah/letters/migrate-legacy request', {
      userId: user.id,
      letters: dto.letters?.length ?? 0,
      types: dto.letters?.map((letter) => letter.type) ?? [],
      sourceLegacyReportIds: dto.letters?.map((letter) => letter.sourceLegacyReportId ?? null) ?? [],
    });

    const result = await this.sarahService.migrateLegacy(user.id, dto.letters);
    sarahDebugLog('POST /sarah/letters/migrate-legacy result', {
      userId: user.id,
      letters: result.letters?.length ?? 0,
      types: result.letters?.map((letter) => letter.type) ?? [],
    });
    return result;
  }

  /**
   * 内部接口：为指定用户补发指定周的周报，仅供管理员/运维调用。
   * 鉴权：Header `X-Internal-Token: <SARAH_INTERNAL_TOKEN>`
   * 客户端不应调用此接口。
   */
  @Post('generate-weekly')
  @HttpCode(200)
  @UseGuards(InternalGuard)
  async generateWeeklyInternal(@Body() dto: GenerateWeeklyInternalDto) {
    return this.sarahService.generateWeeklyInternal(dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    await this.sarahService.delete(user.id, id);
  }

  @Patch(':id')
  async patch(@CurrentUser() user: JwtUser, @Param('id') id: string, @Body() dto: PatchSarahLetterDto) {
    const result = await this.sarahService.patch(user.id, id, dto);
    sarahDebugLog('PATCH /sarah/letters/:id result', {
      userId: user.id,
      letterId: id,
      isRead: dto.isRead,
      type: result.letter?.type ?? null,
    });
    return result;
  }
}
