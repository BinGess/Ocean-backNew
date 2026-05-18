import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SarahCozeClient } from './sarah-coze.client';
import { SarahController } from './sarah.controller';
import { SarahService } from './sarah.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [SarahController],
  providers: [SarahService, SarahCozeClient],
})
export class SarahModule {}
