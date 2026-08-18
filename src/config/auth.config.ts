import { registerAs } from '@nestjs/config';
import { plainToClass } from 'class-transformer';
import { IsBoolean, IsString, validateSync } from 'class-validator';
import { parseBearerTokens, type BearerToken } from '../common/auth/auth.hook.js';

export class AuthConfig {
  /** Basic auth user. Empty when Basic auth is not configured. */
  @IsString()
  public basicUser!: string;

  /** Basic auth password. Empty when Basic auth is not configured. */
  @IsString()
  public basicPass!: string;

  /** Accepted named Bearer credentials. Empty when Bearer auth is not configured. */
  public bearerTokens!: BearerToken[];

  /** True when any authentication method is configured. */
  @IsBoolean()
  public enabled!: boolean;
}

export default registerAs('auth', (): AuthConfig => {
  const basicUser = (process.env.AUTH_BASIC_USER ?? '').trim();
  const basicPass = (process.env.AUTH_BASIC_PASS ?? '').trim();
  const bearerTokens = parseBearerTokens(process.env.AUTH_BEARER_TOKENS);

  const config = plainToClass(AuthConfig, {
    basicUser,
    basicPass,
    bearerTokens,
    // Basic auth needs both halves; a half-configured pair is a mistake, not a setup.
    enabled: (basicUser !== '' && basicPass !== '') || bearerTokens.length > 0,
  });

  const errors = validateSync(config, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors.map(err => Object.values(err.constraints ?? {}).join(', '));
    throw new Error(`Auth config validation error: ${errorMessages.join('; ')}`);
  }

  if ((basicUser === '') !== (basicPass === '')) {
    throw new Error(
      'Auth config validation error: AUTH_BASIC_USER and AUTH_BASIC_PASS must be set together',
    );
  }

  return config;
});
