import { registerAs } from '@nestjs/config';
import { IsBoolean, IsInt, IsString, IsIn, Min, Max } from 'class-validator';
import { normalizeBasePath } from '../common/http/api-prefix.js';
import { validateConfig } from './validate-config.js';

/** Settings that describe how the process serves HTTP and how it shuts down. */
export class AppConfig {
  /**
   * Serves the bundled demo UI. It has no authentication of its own, so the service refuses
   * to start when this is combined with configured credentials.
   */
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

  /** Pino log level. */
  @IsIn(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
  public logLevel!: string;

  /**
   * Seconds to keep serving after SIGTERM while health already reports `shutting_down`.
   * Gives the load balancer time to notice and stop routing here. 0 shuts down at once.
   */
  @IsInt()
  @Min(0)
  @Max(300)
  public shutdownDrainSeconds!: number;

  /**
   * Seconds to wait for a clean close before giving up and exiting with a failure status.
   *
   * A close that never resolves would otherwise keep the process alive until the orchestrator
   * sends SIGKILL, which reports success and hides the hang. Must stay below the compose
   * `stop_grace_period` minus `shutdownDrainSeconds`.
   */
  @IsInt()
  @Min(1)
  @Max(300)
  public shutdownForceExitSeconds!: number;
}

export default registerAs('app', (): AppConfig =>
  validateConfig(
    AppConfig,
    {
      enableUi: process.env.ENABLE_UI === 'true',
      port: parseInt(process.env.LISTEN_PORT ?? '8080', 10),
      host: process.env.LISTEN_HOST ?? '0.0.0.0',
      basePath: normalizeBasePath(process.env.BASE_PATH),
      nodeEnv: process.env.NODE_ENV ?? 'production',
      logLevel: process.env.LOG_LEVEL ?? 'warn',
      shutdownDrainSeconds: parseInt(process.env.SHUTDOWN_DRAIN_SECONDS ?? '5', 10),
      shutdownForceExitSeconds: parseInt(process.env.SHUTDOWN_FORCE_EXIT_SECONDS ?? '10', 10),
    },
    'App',
  ),
);
