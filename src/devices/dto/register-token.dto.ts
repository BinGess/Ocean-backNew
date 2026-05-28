import { IsIn, IsString, Matches } from 'class-validator';

export class RegisterTokenDto {
  @IsString()
  @Matches(/^[0-9a-f]{64}$/i, { message: 'token must be a 64-character hex string' })
  token: string;

  @IsIn(['ios', 'android'])
  platform: 'ios' | 'android';
}
