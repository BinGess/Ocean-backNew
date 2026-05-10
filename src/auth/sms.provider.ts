import { Injectable, InternalServerErrorException } from '@nestjs/common';
import DypnsapiClient, {
  CheckSmsVerifyCodeRequest,
  SendSmsVerifyCodeRequest,
} from '@alicloud/dypnsapi20170525';
import { Config as OpenApiConfig } from '@alicloud/openapi-client';

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export interface SmsSendResult {
  requestId?: string;
  bizId?: string;
}

export interface SmsProvider {
  sendCode(phoneNumber: string, outId: string): Promise<SmsSendResult>;
  checkCode(phoneNumber: string, code: string): Promise<boolean>;
}

@Injectable()
export class AliyunSmsProvider implements SmsProvider {
  private readonly client: DypnsapiClient;

  constructor() {
    this.client = new DypnsapiClient(
      new OpenApiConfig({
        accessKeyId: this.requiredEnv('ALIYUN_ACCESS_KEY_ID'),
        accessKeySecret: this.requiredEnv('ALIYUN_ACCESS_KEY_SECRET'),
        endpoint: process.env.ALIYUN_DYPN_ENDPOINT ?? 'dypnsapi.aliyuncs.com',
      }) as any,
    );
  }

  async sendCode(phoneNumber: string, outId: string): Promise<SmsSendResult> {
    const validSeconds = Number(process.env.ALIYUN_SMS_VALID_SECONDS ?? '300');
    const min = Math.max(1, Math.ceil(validSeconds / 60)).toString();
    const response = await this.client.sendSmsVerifyCode(
      new SendSmsVerifyCodeRequest({
        schemeName: process.env.ALIYUN_SMS_SCHEME_NAME || undefined,
        countryCode: '86',
        phoneNumber,
        signName: this.requiredEnv('ALIYUN_SMS_SIGN_NAME'),
        templateCode: this.requiredEnv('ALIYUN_SMS_TEMPLATE_CODE'),
        templateParam: JSON.stringify({ code: '##code##', min }),
        codeLength: Number(process.env.ALIYUN_SMS_CODE_LENGTH ?? '6'),
        validTime: validSeconds,
        duplicatePolicy: 1,
        interval: Number(process.env.ALIYUN_SMS_INTERVAL_SECONDS ?? '60'),
        codeType: 1,
        returnVerifyCode: false,
        autoRetry: 1,
        outId,
      }),
    );
    const body = response.body;
    if (body?.success !== true || body.code !== 'OK') {
      throw new InternalServerErrorException('Sms provider rejected send request');
    }
    return {
      requestId: body.requestId,
      bizId: body.model?.bizId,
    };
  }

  async checkCode(phoneNumber: string, code: string): Promise<boolean> {
    const response = await this.client.checkSmsVerifyCode(
      new CheckSmsVerifyCodeRequest({
        schemeName: process.env.ALIYUN_SMS_SCHEME_NAME || undefined,
        countryCode: '86',
        phoneNumber,
        verifyCode: code,
        caseAuthPolicy: 1,
      }),
    );
    const body = response.body;
    return body?.success === true && body.code === 'OK' && body.model?.verifyResult === 'PASS';
  }

  private requiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
  }
}

@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  async sendCode(phoneNumber: string, outId: string): Promise<SmsSendResult> {
    // Local/dev provider. Aliyun still validates in staging/production.
    console.info(`Ocean SMS verification requested for ${phoneNumber.slice(0, 3)}****${phoneNumber.slice(-4)}`);
    return { requestId: `console-${outId}` };
  }

  async checkCode(_phoneNumber: string, code: string): Promise<boolean> {
    return code === (process.env.CONSOLE_SMS_CODE ?? '123456');
  }
}
