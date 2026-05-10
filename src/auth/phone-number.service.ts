import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from 'crypto';

export interface NormalizedPhoneNumber {
  countryCode: string;
  nationalNumber: string;
  e164: string;
  hash: string;
  encrypted: string;
  masked: string;
}

@Injectable()
export class PhoneNumberService {
  private readonly hashSecret = process.env.PHONE_HASH_SECRET ?? process.env.JWT_ACCESS_SECRET ?? 'dev-phone-hash';
  private readonly encryptionSecret =
    process.env.PHONE_ENCRYPTION_SECRET ?? process.env.JWT_REFRESH_SECRET ?? 'dev-phone-encryption';

  normalize(rawPhone: string): NormalizedPhoneNumber {
    const nationalNumber = this.normalizeNationalNumber(rawPhone);
    const countryCode = '86';
    const e164 = `+${countryCode}${nationalNumber}`;
    return {
      countryCode,
      nationalNumber,
      e164,
      hash: this.hash(e164),
      encrypted: this.encrypt(e164),
      masked: this.mask(nationalNumber),
    };
  }

  maskStored(encrypted?: string | null): string | null {
    if (!encrypted) return null;
    try {
      const phone = this.decrypt(encrypted);
      return this.mask(phone.replace(/^\+86/, ''));
    } catch {
      return null;
    }
  }

  hashE164(e164: string): string {
    return this.hash(e164);
  }

  private normalizeNationalNumber(rawPhone: string): string {
    const compact = rawPhone.replace(/[\s-]/g, '');
    const withoutCountryCode = compact.replace(/^\+?86/, '');
    if (!/^1[3-9]\d{9}$/.test(withoutCountryCode)) {
      throw new Error('Invalid phone number');
    }
    return withoutCountryCode;
  }

  private hash(value: string): string {
    return createHmac('sha256', this.hashSecret).update(value).digest('hex');
  }

  private encrypt(value: string): string {
    const key = createHash('sha256').update(this.encryptionSecret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`;
  }

  private decrypt(value: string): string {
    const [ivRaw, authTagRaw, encryptedRaw] = value.split('.');
    if (!ivRaw || !authTagRaw || !encryptedRaw) throw new Error('Invalid encrypted phone');
    const key = createHash('sha256').update(this.encryptionSecret).digest();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagRaw, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private mask(nationalNumber: string): string {
    return `${nationalNumber.slice(0, 3)}****${nationalNumber.slice(-4)}`;
  }
}
