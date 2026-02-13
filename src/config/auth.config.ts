import { registerAs } from '@nestjs/config';
import { plainToClass } from 'class-transformer';
import { IsOptional, IsString, validateSync } from 'class-validator';

export class AuthConfig {
  @IsOptional()
  @IsString()
  public basicUser?: string;

  @IsOptional()
  @IsString()
  public basicPass?: string;

  @IsOptional()
  @IsString()
  public bearerTokens?: string;
}

export default registerAs('auth', (): AuthConfig & { bearerTokenList: string[] } => {
  const config = plainToClass(AuthConfig, {
    basicUser: process.env.AUTH_BASIC_USER,
    basicPass: process.env.AUTH_BASIC_PASS,
    bearerTokens: process.env.AUTH_BEARER_TOKENS,
  });

  const errors = validateSync(config, {
    skipMissingProperties: true,
  });

  if (errors.length > 0) {
    const errorMessages = errors.map(err => Object.values(err.constraints ?? {}).join(', '));
    throw new Error(`Auth config validation error: ${errorMessages.join('; ')}`);
  }

  const bearerTokenList = (config.bearerTokens ?? '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  return {
    ...config,
    bearerTokenList,
  };
});
