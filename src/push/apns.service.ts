import * as http2 from 'node:http2';
import * as crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ApnsSendResult {
  success: boolean;
  tokenExpired?: boolean; // APNs 返回 410，token 已失效
}

const APNS_HOST_PROD = 'api.push.apple.com';
const APNS_HOST_SAND = 'api.sandbox.push.apple.com';

/** JWT 有效期 45 分钟，到期前重新签发 */
const JWT_TTL_MS = 45 * 60 * 1000;

@Injectable()
export class ApnsService {
  private readonly logger = new Logger(ApnsService.name);

  // 缓存 JWT，避免每次请求都重新签发
  private cachedJwt: string | null = null;
  private jwtIssuedAt = 0;

  constructor(private readonly config: ConfigService) {}

  async send(deviceToken: string, payload: Record<string, unknown>): Promise<ApnsSendResult> {
    const keyP8   = this.config.get<string>('APNS_KEY_P8');
    const keyId   = this.config.get<string>('APNS_KEY_ID');
    const teamId  = this.config.get<string>('APNS_TEAM_ID');
    const bundleId = this.config.get<string>('APNS_BUNDLE_ID');
    const production = this.config.get<string>('APNS_PRODUCTION') === 'true';

    if (!keyP8 || !keyId || !teamId || !bundleId) {
      this.logger.warn('[APNs] Missing configuration (APNS_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID), push skipped');
      return { success: false };
    }

    const jwtToken = this.getJwt(keyP8, keyId, teamId);
    const host = production ? APNS_HOST_PROD : APNS_HOST_SAND;
    const body = JSON.stringify(payload);

    return new Promise<ApnsSendResult>((resolve) => {
      const client = http2.connect(`https://${host}`, {
        // Apple 要求 HTTP/2，Node 默认支持
      });

      client.once('error', (err) => {
        this.logger.error(`[APNs] Connection error: ${err.message}`);
        resolve({ success: false });
        client.destroy();
      });

      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        'authorization': `bearer ${jwtToken}`,
        'apns-push-type': 'alert',
        'apns-topic': bundleId,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      });

      req.write(body);
      req.end();

      let statusCode = 0;
      req.on('response', (headers) => {
        statusCode = Number(headers[':status'] ?? 0);
      });

      let responseBody = '';
      req.on('data', (chunk: Buffer) => { responseBody += chunk.toString(); });

      req.on('end', () => {
        client.close();
        if (statusCode === 200) {
          resolve({ success: true });
        } else if (statusCode === 410) {
          // Token 已被 Apple 标记为失效
          resolve({ success: false, tokenExpired: true });
        } else {
          this.logger.warn(`[APNs] Push failed — status=${statusCode} body=${responseBody.slice(0, 200)}`);
          resolve({ success: false });
        }
      });

      req.on('error', (err) => {
        this.logger.error(`[APNs] Request error: ${err.message}`);
        client.close();
        resolve({ success: false });
      });
    });
  }

  // ─── JWT 签发（ES256，Apple 官方要求） ────────────────────────────────────

  private getJwt(keyP8: string, keyId: string, teamId: string): string {
    const now = Date.now();
    if (this.cachedJwt && now - this.jwtIssuedAt < JWT_TTL_MS) {
      return this.cachedJwt;
    }

    const issuedAt = Math.floor(now / 1000);
    const header = this.base64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
    const payload = this.base64url(JSON.stringify({ iss: teamId, iat: issuedAt }));
    const unsigned = `${header}.${payload}`;

    const sign = crypto.createSign('SHA256');
    sign.update(unsigned);
    const signature = sign.sign({ key: keyP8, dsaEncoding: 'ieee-p1363' });

    this.cachedJwt = `${unsigned}.${this.base64url(signature)}`;
    this.jwtIssuedAt = now;
    return this.cachedJwt;
  }

  private base64url(input: string | Buffer): string {
    const buf = typeof input === 'string' ? Buffer.from(input) : input;
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}
