import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { HealthController } from './health.controller';
import { DailyModule } from './daily/daily.module';
import { MeModule } from './me/me.module';
import { PrismaModule } from './prisma/prisma.module';
import { RecordsModule } from './records/records.module';
import { ReportsModule } from './reports/reports.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    MeModule,
    RecordsModule,
    DailyModule,
    ReportsModule,
    SyncModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
