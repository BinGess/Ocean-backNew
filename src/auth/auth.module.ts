import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { PhoneNumberService } from './phone-number.service';
import { SmsRateLimitService } from './sms-rate-limit.service';
import { AliyunSmsProvider, ConsoleSmsProvider, SMS_PROVIDER } from './sms.provider';
import { TokenService } from './token.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    PhoneNumberService,
    SmsRateLimitService,
    {
      provide: SMS_PROVIDER,
      useFactory: () =>
        process.env.SMS_PROVIDER === 'console' || process.env.NODE_ENV !== 'production'
          ? new ConsoleSmsProvider()
          : new AliyunSmsProvider(),
    },
    {
      provide: TokenService,
      useFactory: () => new TokenService(),
    },
    JwtAuthGuard,
  ],
  exports: [AuthService, TokenService, JwtAuthGuard],
})
export class AuthModule {}
