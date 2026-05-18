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
  list(@CurrentUser() user: JwtUser) {
    return this.sarahService.list(user.id);
  }

  @Post('welcome')
  @HttpCode(200)
  welcome(@CurrentUser() user: JwtUser) {
    return this.sarahService.welcome(user.id);
  }

  @Post('migrate-legacy')
  @HttpCode(200)
  migrateLegacy(@CurrentUser() user: JwtUser, @Body() dto: MigrateLegacyLettersDto) {
    return this.sarahService.migrateLegacy(user.id, dto.letters);
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
