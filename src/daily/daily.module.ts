import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DailyController } from './daily.controller';
import { DailyService } from './daily.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [DailyController],
  providers: [DailyService],
})
export class DailyModule {}
