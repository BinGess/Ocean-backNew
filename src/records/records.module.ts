import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [RecordsController],
  providers: [RecordsService],
})
export class RecordsModule {}
