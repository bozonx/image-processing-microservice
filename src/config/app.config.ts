import { registerAs } from '@nestjs/config';
import { IsInt, IsString, IsIn, Min, Max, validateSync, IsBoolean } from 'class-validator';
import { plainToClass } from 'class-transformer';

export class AppConfig {
  @IsBoolean()
  public enableUi!: boolean;

  @IsInt()
  @Min(1)
  @Max(65535)
  public port!: number;

  @IsString()
  public host!: string;

  @IsString()
  public basePath!: string;

  @IsIn(['development', 'production', 'test'])
  public nodeEnv!: string;

  // Allow only Pino log levels
  @IsIn(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
  public logLevel!: string;

  @IsInt()
  @Min(0)
  public shutdownDrainSeconds!: number;
}

export default registerAs('app', (): AppConfig => {
  const config = plainToClass(AppConfig, {
    enableUi: process.env.ENABLE_UI === 'true',
    port: parseInt(process.env.LISTEN_PORT ?? '8080', 10),
    host: process.env.LISTEN_HOST ?? '0.0.0.0',
    basePath: (process.env.BASE_PATH ?? '').replace(/^\/+|\/+$/g, ''),
    nodeEnv: process.env.NODE_ENV ?? 'production',
    logLevel: process.env.LOG_LEVEL ?? 'warn',
    shutdownDrainSeconds: parseInt(process.env.SHUTDOWN_DRAIN_SECONDS ?? '5', 10),
  });

  const errors = validateSync(config, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors.map(err => Object.values(err.constraints ?? {}).join(', '));
    throw new Error(`App config validation error: ${errorMessages.join('; ')}`);
  }

  return config;
});
