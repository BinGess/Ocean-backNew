import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, JwtUser } from '../common/guards/jwt-auth.guard';
import { UpsertRecordDto } from './dto/record.dto';
import { RecordsService } from './records.service';

@ApiTags('records')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('records')
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.recordsService.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() dto: UpsertRecordDto) {
    return this.recordsService.create(user.id, dto);
  }

  @Put(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpsertRecordDto,
  ) {
    return this.recordsService.update(user.id, id, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.recordsService.delete(user.id, id);
  }
}
