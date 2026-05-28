import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DevicesModule } from '../devices/devices.module';
import { PushModule } from '../push/push.module';
import { SarahAdminController } from './sarah-admin.controller';
import { SarahCozeClient } from './sarah-coze.client';
import { SarahController } from './sarah.controller';
import { SarahSchedulerService } from './sarah-scheduler.service';
import { SarahService } from './sarah.service';
import { InternalGuard } from '../common/guards/internal.guard';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    DevicesModule,
    PushModule,
    ScheduleModule.forRoot(), // 启用 @nestjs/schedule Cron 调度器
  ],
  controllers: [SarahController, SarahAdminController],
  providers: [SarahService, SarahCozeClient, SarahSchedulerService, InternalGuard],
})
export class SarahModule {}
