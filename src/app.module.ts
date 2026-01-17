import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './modules/health/health.module.js';
import { ImageProcessingModule } from './modules/image-processing/image-processing.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import appConfig from './config/app.config.js';
import imageConfig from './config/image.config.js';
import { getLoggerConfig } from './common/logger/logger.factory.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, imageConfig],
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
      cache: true,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: getLoggerConfig,
    }),
    HealthModule,
    ImageProcessingModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
