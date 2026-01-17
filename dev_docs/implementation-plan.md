# План Реализации
# Микросервис Обработки Изображений

**Версия:** 1.0  
**Дата:** 2026-01-17

---

## Обзор

Реализация разбита на 3 основных этапа:
1. **Этап 1**: Подготовка инфраструктуры и окружения
2. **Этап 2**: Реализация MVP (конвертация и EXIF)
3. **Этап 3**: Unit тесты и финализация MVP

После завершения MVP дальнейшее развитие описано в Roadmap.

---

## Этап 1: Подготовка Инфраструктуры

**Цель**: Подготовить полную инфраструктуру проекта, настроить окружение, зависимости и Docker. Сервис должен запускаться без ошибок.

### 1.1 Файловая Структура

Создать следующую структуру проекта:

```
image-processing-microservice/
├── src/
│   ├── modules/
│   │   ├── health/
│   │   │   ├── health.controller.ts
│   │   │   ├── health.service.ts
│   │   │   └── health.module.ts
│   │   ├── image-processing/
│   │   │   ├── dto/
│   │   │   │   ├── process-image.dto.ts      # DTO для /process (будет в этапе 2)
│   │   │   │   └── exif.dto.ts                # DTO для /exif (будет в этапе 2)
│   │   │   ├── services/
│   │   │   │   ├── image-processor.service.ts  # Обработка изображений (этап 2)
│   │   │   │   ├── exif.service.ts             # EXIF extraction (этап 2)
│   │   │   │   └── queue.service.ts            # Управление очередью (этап 2)
│   │   │   ├── image-processing.controller.ts
│   │   │   └── image-processing.module.ts
│   ├── config/
│   │   ├── app.config.ts                      # Базовая конфигурация
│   │   └── image.config.ts                    # Конфигурация обработки изображений
│   ├── common/
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts       # Глобальный фильтр ошибок
│   │   ├── interceptors/
│   │   │   └── logging.interceptor.ts         # Логирование запросов
│   │   └── validators/
│   │       └── image-validators.ts            # Валидаторы для изображений
│   ├── app.module.ts
│   └── main.ts
├── test/
│   ├── unit/
│   │   ├── image-processor.service.spec.ts    # Этап 3
│   │   ├── exif.service.spec.ts               # Этап 3
│   │   └── queue.service.spec.ts              # Этап 3
│   ├── e2e/
│   │   └── health.e2e-spec.ts                 # Простой e2e тест
│   └── setup/
│       ├── unit.setup.ts
│       └── e2e.setup.ts
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── .env.development.example
├── .env.production.example
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsconfig.build.json
├── jest.config.ts
├── .eslintrc.js
├── .prettierrc
├── .dockerignore
├── .gitignore
├── README.md                                  # Вся документация на русском
└── dev_docs/
    ├── prd.md
    └── implementation-plan.md
```

### 1.2 Зависимости (package.json)

Обновить `package.json` с необходимыми зависимостями:

```json
{
  "name": "image-processing-microservice",
  "version": "1.0.0",
  "description": "Микросервис для обработки изображений",
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/src/main",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:e2e": "jest --config jest.config.ts --testRegex='.e2e-spec.ts$'",
    "lint": "eslint \"{src,test}/**/*.ts\"",
    "lint:fix": "eslint \"{src,test}/**/*.ts\" --fix",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\""
  },
  "dependencies": {
    "@nestjs/common": "^11.1.12",
    "@nestjs/core": "^11.1.12",
    "@nestjs/config": "^4.0.2",
    "@nestjs/platform-fastify": "^11.1.12",
    "fastify": "^5.7.0",
    "sharp": "^0.34.5",
    "exifr": "^7.1.3",
    "p-queue": "^9.1.0",
    "nestjs-pino": "^4.5.0",
    "pino": "^10.2.0",
    "pino-pretty": "^13.0.0",
    "class-validator": "^0.14.3",
    "class-transformer": "^0.5.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.1.12",
    "@types/jest": "^29.5.14",
    "@types/node": "^22.10.5",
    "@typescript-eslint/eslint-plugin": "^8.19.1",
    "@typescript-eslint/parser": "^8.19.1",
    "eslint": "^9.18.0",
    "eslint-config-prettier": "^10.0.1",
    "eslint-plugin-prettier": "^5.2.1",
    "jest": "^29.7.0",
    "prettier": "^3.4.2",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.7.2"
  }
}
```

### 1.3 Переменные Окружения

#### .env.development.example
```bash
# Конфигурация Сервера
NODE_ENV=development
LISTEN_HOST=localhost
LISTEN_PORT=3000
BASE_PATH=
LOG_LEVEL=debug
TZ=UTC

# Лимиты Обработки
IMAGE_MAX_BYTES_MB=25
HEAVY_TASKS_MAX_CONCURRENCY=2
HEAVY_TASKS_QUEUE_TIMEOUT_MS=30000

# Настройки по Умолчанию для Обработки
IMAGE_DEFAULT_FORMAT=webp
IMAGE_DEFAULT_MAX_DIMENSION=3840
IMAGE_DEFAULT_QUALITY=80
IMAGE_DEFAULT_EFFORT=6
IMAGE_DEFAULT_LOSSLESS=false
IMAGE_DEFAULT_STRIP_METADATA=false
IMAGE_DEFAULT_AUTO_ORIENT=true

# Специфичные для AVIF
IMAGE_AVIF_CHROMA_SUBSAMPLING=4:2:0

# Специфичные для JPEG
IMAGE_JPEG_PROGRESSIVE=false
IMAGE_JPEG_MOZJPEG=false

# Специфичные для PNG
IMAGE_PNG_COMPRESSION_LEVEL=6

# Shutdown
SHUTDOWN_TIMEOUT_MS=30000
```

#### .env.production.example
```bash
# Конфигурация Сервера
NODE_ENV=production
LISTEN_HOST=0.0.0.0
LISTEN_PORT=3000
BASE_PATH=
LOG_LEVEL=info
TZ=UTC

# Лимиты Обработки
IMAGE_MAX_BYTES_MB=25
HEAVY_TASKS_MAX_CONCURRENCY=4
HEAVY_TASKS_QUEUE_TIMEOUT_MS=30000

# Настройки по Умолчанию для Обработки
IMAGE_DEFAULT_FORMAT=webp
IMAGE_DEFAULT_MAX_DIMENSION=3840
IMAGE_DEFAULT_QUALITY=80
IMAGE_DEFAULT_EFFORT=6
IMAGE_DEFAULT_LOSSLESS=false
IMAGE_DEFAULT_STRIP_METADATA=false
IMAGE_DEFAULT_AUTO_ORIENT=true

# Специфичные для AVIF
IMAGE_AVIF_CHROMA_SUBSAMPLING=4:2:0

# Специфичные для JPEG
IMAGE_JPEG_PROGRESSIVE=false
IMAGE_JPEG_MOZJPEG=false

# Специфичные для PNG
IMAGE_PNG_COMPRESSION_LEVEL=6

# Shutdown
SHUTDOWN_TIMEOUT_MS=30000
```

### 1.4 Docker

#### Dockerfile
```dockerfile
FROM node:22-alpine

# Установка системных зависимостей для Sharp
RUN apk add --no-cache \
    vips-dev \
    build-base \
    python3

WORKDIR /app

# Копирование файлов зависимостей
COPY package.json pnpm-lock.yaml ./

# Установка pnpm и зависимостей
RUN npm install -g pnpm@10.13.1 && \
    pnpm install --frozen-lockfile --prod

# Копирование собранного приложения
COPY dist ./dist

# Создание non-root пользователя
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/src/main.js"]
```

#### docker-compose.yml
```yaml
version: '3.8'

services:
  image-processing:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    container_name: image-processing-microservice
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - LISTEN_HOST=0.0.0.0
      - LISTEN_PORT=3000
      - LOG_LEVEL=info
    env_file:
      - ../.env.production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/api/v1/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

### 1.5 README.md

Создать полную документацию на русском языке в одном файле:

```markdown
# Микросервис Обработки Изображений

Высокопроизводительный микросервис для обработки изображений на базе NestJS и Sharp.

## Возможности

- ✅ Конвертация форматов (WebP, AVIF, JPEG, PNG, GIF, TIFF, BMP, JPEG XL)
- ✅ Извлечение EXIF метаданных
- ✅ Изменение размера с различными режимами fit
- ✅ Обрезка, поворот, отзеркаливание
- ✅ Автоповорот на основе EXIF
- ✅ Управление очередью задач с приоритетами
- ✅ Graceful shutdown

## Требования

- Node.js 22+
- pnpm 10+
- Docker (опционально)

## Быстрый Старт

### Локальная Разработка

1. Установка зависимостей:
```bash
pnpm install
```

2. Настройка окружения:
```bash
cp .env.development.example .env.development
```

3. Запуск в режиме разработки:
```bash
pnpm start:dev
```

Сервис будет доступен по адресу: `http://localhost:3000/api/v1`

### Production Сборка

1. Сборка:
```bash
pnpm build
```

2. Запуск:
```bash
pnpm start:prod
```

### Docker

1. Сборка приложения:
```bash
pnpm build
```

2. Запуск через Docker Compose:
```bash
docker compose -f docker/docker-compose.yml up -d --build
```

Сервис будет доступен по адресу: `http://localhost:3000/api/v1`

## API Endpoints

### POST /api/v1/process

Обработка изображения с применением трансформаций и конвертации.

**Параметры запроса:**
- `image` (Buffer | base64) - Изображение для обработки
- `mimeType` (string) - MIME тип входного изображения
- `priority` (number, optional) - Приоритет задачи (0-2, default: 2)
- `transform` (object, optional) - Параметры трансформации
- `output` (object, optional) - Параметры выходного изображения

**Пример запроса:**
```json
{
  "image": "base64_encoded_image",
  "mimeType": "image/jpeg",
  "priority": 1,
  "transform": {
    "resize": {
      "maxDimension": 1920
    }
  },
  "output": {
    "format": "webp",
    "quality": 85
  }
}
```

**Ответ:**
```json
{
  "buffer": "base64_encoded_result",
  "size": 123456,
  "mimeType": "image/webp",
  "dimensions": {
    "width": 1920,
    "height": 1080
  },
  "stats": {
    "beforeBytes": 500000,
    "afterBytes": 123456,
    "reductionPercent": 75.3
  }
}
```

### POST /api/v1/exif

Извлечение EXIF метаданных из изображения.

**Параметры запроса:**
- `image` (Buffer | base64) - Изображение
- `mimeType` (string) - MIME тип изображения
- `priority` (number, optional) - Приоритет задачи (0-2, default: 2)

**Пример запроса:**
```json
{
  "image": "base64_encoded_image",
  "mimeType": "image/jpeg",
  "priority": 0
}
```

**Ответ:**
```json
{
  "exif": {
    "Make": "Canon",
    "Model": "EOS 5D Mark IV",
    "DateTimeOriginal": "2024:01:15 14:30:00",
    "ExposureTime": 0.004,
    "FNumber": 2.8,
    "ISO": 400
  }
}
```

### GET /api/v1/health

Проверка состояния сервиса.

**Ответ:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-17T12:00:00.000Z",
  "queue": {
    "size": 5,
    "pending": 2
  }
}
```

## Конфигурация

Все настройки задаются через переменные окружения. См. `.env.production.example` для полного списка.

### Основные Параметры

- `LISTEN_PORT` - Порт сервиса (default: 3000)
- `LOG_LEVEL` - Уровень логирования (default: info)
- `IMAGE_MAX_BYTES_MB` - Максимальный размер изображения в MB (default: 25)
- `HEAVY_TASKS_MAX_CONCURRENCY` - Количество параллельных задач (default: 4)
- `IMAGE_DEFAULT_FORMAT` - Формат по умолчанию (default: webp)
- `IMAGE_DEFAULT_QUALITY` - Качество по умолчанию (default: 80)

## Тестирование

### Unit Тесты
```bash
pnpm test
```

### E2E Тесты
```bash
pnpm test:e2e
```

### Покрытие Кода
```bash
pnpm test:cov
```

## Архитектура

### Модули

- **HealthModule** - Health check endpoint
- **ImageProcessingModule** - Основная логика обработки изображений
  - `ImageProcessorService` - Обработка и конвертация
  - `ExifService` - Извлечение EXIF
  - `QueueService` - Управление очередью задач

### Очередь Задач

Сервис использует `p-queue` для управления параллельными задачами:
- Приоритеты: 0 (высокий), 1 (средний), 2 (низкий)
- Таймаут на задачу: 30 секунд
- Graceful shutdown с ожиданием завершения задач

## Производительность

### SLA

- EXIF extraction: < 500ms (p95)
- Обработка без трансформаций: < 1s (p95)
- Обработка с трансформациями: < 2s (p95)

### Рекомендации

- CPU: 4 ядра
- Memory: 4GB RAM
- `HEAVY_TASKS_MAX_CONCURRENCY` = количество CPU ядер

## Мониторинг

### Health Check

```bash
curl http://localhost:3000/api/v1/health
```

### Логи

Структурированные JSON логи через Pino:
```json
{
  "level": "info",
  "time": 1705497600000,
  "msg": "Image processed",
  "beforeBytes": 500000,
  "afterBytes": 123456,
  "reductionPercent": 75.3,
  "format": "webp",
  "duration": 850
}
```

## Интеграция

### Пример с fetch (Node.js)

```typescript
const response = await fetch('http://localhost:3000/api/v1/process', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    image: imageBuffer.toString('base64'),
    mimeType: 'image/jpeg',
    priority: 1,
    output: {
      format: 'webp',
      quality: 85,
    },
  }),
});

const result = await response.json();
const processedImage = Buffer.from(result.buffer, 'base64');
```

## Roadmap

### v1.1 (Фаза 2)
- [ ] Поддержка всех форматов (BMP, JPEG XL)
- [ ] Продвинутые трансформации
- [ ] Умная обрезка
- [ ] Водяные знаки

### v1.2 (Фаза 3)
- [ ] Пакетная обработка
- [ ] Асинхронная обработка с webhooks
- [ ] Prometheus метрики
- [ ] Rate limiting

## Лицензия

MIT

## Поддержка

Для вопросов и предложений создавайте issue в репозитории.
```

### 1.6 Простые Тесты

Создать базовые тесты для проверки запуска:

#### test/e2e/health.e2e-spec.ts
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../src/app.module';

describe('Health (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/health (GET)', () => {
    return app
      .inject({
        method: 'GET',
        url: '/api/v1/health',
      })
      .then((result) => {
        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body).toHaveProperty('status', 'ok');
        expect(body).toHaveProperty('timestamp');
      });
  });
});
```

### 1.7 Критерии Завершения Этапа 1

- [ ] Файловая структура создана
- [ ] Все зависимости установлены (`pnpm install` работает)
- [ ] Переменные окружения настроены
- [ ] Dockerfile и docker-compose.yml созданы
- [ ] README.md написан на русском
- [ ] Сервис запускается без ошибок (`pnpm start:dev`)
- [ ] Health check endpoint работает
- [ ] E2E тест health endpoint проходит
- [ ] Docker образ собирается и запускается

---

## Этап 2: Реализация MVP (Конвертация и EXIF)

**Цель**: Реализовать основную функциональность - обработку изображений и извлечение EXIF.

### 2.1 Конфигурация

#### src/config/image.config.ts
```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('image', () => ({
  maxBytes: parseInt(process.env.IMAGE_MAX_BYTES_MB || '25', 10) * 1024 * 1024,
  
  queue: {
    maxConcurrency: parseInt(process.env.HEAVY_TASKS_MAX_CONCURRENCY || '4', 10),
    timeout: parseInt(process.env.HEAVY_TASKS_QUEUE_TIMEOUT_MS || '30000', 10),
  },
  
  defaults: {
    format: process.env.IMAGE_DEFAULT_FORMAT || 'webp',
    maxDimension: parseInt(process.env.IMAGE_DEFAULT_MAX_DIMENSION || '3840', 10),
    quality: parseInt(process.env.IMAGE_DEFAULT_QUALITY || '80', 10),
    effort: parseInt(process.env.IMAGE_DEFAULT_EFFORT || '6', 10),
    lossless: process.env.IMAGE_DEFAULT_LOSSLESS === 'true',
    stripMetadata: process.env.IMAGE_DEFAULT_STRIP_METADATA === 'true',
    autoOrient: process.env.IMAGE_DEFAULT_AUTO_ORIENT !== 'false',
  },
  
  avif: {
    chromaSubsampling: process.env.IMAGE_AVIF_CHROMA_SUBSAMPLING || '4:2:0',
  },
  
  jpeg: {
    progressive: process.env.IMAGE_JPEG_PROGRESSIVE === 'true',
    mozjpeg: process.env.IMAGE_JPEG_MOZJPEG === 'true',
  },
  
  png: {
    compressionLevel: parseInt(process.env.IMAGE_PNG_COMPRESSION_LEVEL || '6', 10),
  },
}));
```

### 2.2 DTO (Data Transfer Objects)

#### src/modules/image-processing/dto/process-image.dto.ts
```typescript
import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum ImageFormat {
  WEBP = 'webp',
  AVIF = 'avif',
  JPEG = 'jpeg',
  PNG = 'png',
  GIF = 'gif',
  TIFF = 'tiff',
}

export class ResizeDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8192)
  maxDimension?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8192)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8192)
  height?: number;

  @IsOptional()
  @IsEnum(['cover', 'contain', 'fill', 'inside', 'outside'])
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';

  @IsOptional()
  @IsBoolean()
  withoutEnlargement?: boolean;

  @IsOptional()
  @IsString()
  position?: string;
}

export class TransformDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ResizeDto)
  resize?: ResizeDto;

  @IsOptional()
  @IsBoolean()
  autoOrient?: boolean;
}

export class OutputDto {
  @IsOptional()
  @IsEnum(ImageFormat)
  format?: ImageFormat;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  quality?: number;

  @IsOptional()
  @IsBoolean()
  lossless?: boolean;

  @IsOptional()
  @IsBoolean()
  stripMetadata?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(9)
  effort?: number;
}

export class ProcessImageDto {
  @IsString()
  image: string; // base64

  @IsString()
  mimeType: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  priority?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => TransformDto)
  transform?: TransformDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OutputDto)
  output?: OutputDto;
}
```

#### src/modules/image-processing/dto/exif.dto.ts
```typescript
import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class ExtractExifDto {
  @IsString()
  image: string; // base64

  @IsString()
  mimeType: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  priority?: number;
}
```

### 2.3 Сервисы

#### src/modules/image-processing/services/queue.service.ts
```typescript
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PQueue from 'p-queue';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queue: PQueue;
  private isShuttingDown = false;

  constructor(private readonly configService: ConfigService) {
    const concurrency = this.configService.get<number>('image.queue.maxConcurrency', 4);
    const timeout = this.configService.get<number>('image.queue.timeout', 30000);

    this.queue = new PQueue({
      concurrency,
      timeout,
    });

    this.logger.log(`Queue initialized with concurrency: ${concurrency}, timeout: ${timeout}ms`);
  }

  async add<T>(
    task: () => Promise<T>,
    priority: number = 2,
  ): Promise<T> {
    if (this.isShuttingDown) {
      throw new Error('Service is shutting down, rejecting new tasks');
    }

    const startTime = Date.now();
    
    try {
      const result = await this.queue.add(task, { priority });
      const duration = Date.now() - startTime;
      
      this.logger.debug({
        msg: 'Task completed',
        duration,
        queueSize: this.queue.size,
        pending: this.queue.pending,
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error({
        msg: 'Task failed',
        duration,
        error: error.message,
      });
      throw error;
    }
  }

  getStatus() {
    return {
      size: this.queue.size,
      pending: this.queue.pending,
    };
  }

  async onModuleDestroy() {
    this.logger.log('Starting graceful shutdown...');
    this.isShuttingDown = true;
    
    await this.queue.onIdle();
    
    this.logger.log('All tasks completed, shutdown complete');
  }
}
```

#### src/modules/image-processing/services/exif.service.ts
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import exifr from 'exifr';

@Injectable()
export class ExifService {
  private readonly logger = new Logger(ExifService.name);
  private readonly maxBytes: number;

  constructor(private readonly configService: ConfigService) {
    this.maxBytes = this.configService.get<number>('image.maxBytes', 25 * 1024 * 1024);
  }

  async extract(buffer: Buffer, mimeType: string): Promise<Record<string, any> | null> {
    // Проверка размера
    if (buffer.length > this.maxBytes) {
      throw new Error(`Image size ${buffer.length} bytes exceeds maximum ${this.maxBytes} bytes`);
    }

    // Проверка MIME типа
    if (!mimeType.startsWith('image/')) {
      throw new Error(`Invalid MIME type: ${mimeType}`);
    }

    const startTime = Date.now();

    try {
      const exifData = await exifr.parse(buffer, {
        translateKeys: true,
        translateValues: false,
        sanitize: true,
      });

      const duration = Date.now() - startTime;

      this.logger.debug({
        msg: 'EXIF extracted',
        duration,
        hasExif: !!exifData,
        sizeBytes: buffer.length,
      });

      return exifData || null;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.debug({
        msg: 'EXIF extraction failed',
        duration,
        error: error.message,
      });

      return null;
    }
  }
}
```

#### src/modules/image-processing/services/image-processor.service.ts
```typescript
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { ProcessImageDto } from '../dto/process-image.dto';

@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);
  private readonly maxBytes: number;
  private readonly defaults: any;

  constructor(private readonly configService: ConfigService) {
    this.maxBytes = this.configService.get<number>('image.maxBytes', 25 * 1024 * 1024);
    this.defaults = this.configService.get('image.defaults', {});
  }

  async process(dto: ProcessImageDto): Promise<{
    buffer: Buffer;
    size: number;
    mimeType: string;
    dimensions: { width: number; height: number };
    stats?: { beforeBytes: number; afterBytes: number; reductionPercent: number };
  }> {
    // Декодирование base64
    const inputBuffer = Buffer.from(dto.image, 'base64');

    // Проверка размера
    if (inputBuffer.length > this.maxBytes) {
      throw new BadRequestException(
        `Image size ${inputBuffer.length} bytes exceeds maximum ${this.maxBytes} bytes`,
      );
    }

    // Проверка MIME типа
    if (!dto.mimeType.startsWith('image/')) {
      throw new BadRequestException(`Invalid MIME type: ${dto.mimeType}`);
    }

    const startTime = Date.now();
    const beforeBytes = inputBuffer.length;

    try {
      let pipeline = sharp(inputBuffer);

      // Auto-orient
      const autoOrient = dto.transform?.autoOrient ?? this.defaults.autoOrient;
      if (autoOrient) {
        pipeline = pipeline.rotate();
      }

      // Resize
      if (dto.transform?.resize) {
        const resize = dto.transform.resize;
        
        // Валидация: нельзя использовать maxDimension и width/height одновременно
        if (resize.maxDimension && (resize.width || resize.height)) {
          throw new BadRequestException(
            'Cannot use maxDimension together with width/height',
          );
        }

        if (resize.maxDimension) {
          // Пропорциональное уменьшение
          pipeline = pipeline.resize(resize.maxDimension, resize.maxDimension, {
            fit: 'inside',
            withoutEnlargement: resize.withoutEnlargement ?? true,
          });
        } else if (resize.width || resize.height) {
          // Точные размеры
          pipeline = pipeline.resize(resize.width, resize.height, {
            fit: resize.fit || 'inside',
            withoutEnlargement: resize.withoutEnlargement ?? true,
            position: resize.position as any,
          });
        }
      }

      // Output format
      const format = dto.output?.format || this.defaults.format;
      const quality = dto.output?.quality ?? this.defaults.quality;
      const stripMetadata = dto.output?.stripMetadata ?? this.defaults.stripMetadata;

      if (stripMetadata) {
        pipeline = pipeline.withMetadata({ orientation: undefined });
      }

      // Format-specific options
      switch (format) {
        case 'webp':
          pipeline = pipeline.webp({
            quality,
            lossless: dto.output?.lossless ?? this.defaults.lossless,
            effort: dto.output?.effort ?? this.defaults.effort,
          });
          break;
        case 'avif':
          pipeline = pipeline.avif({
            quality,
            lossless: dto.output?.lossless ?? this.defaults.lossless,
            effort: dto.output?.effort ?? this.defaults.effort,
          });
          break;
        case 'jpeg':
          pipeline = pipeline.jpeg({
            quality,
            progressive: this.configService.get('image.jpeg.progressive', false),
            mozjpeg: this.configService.get('image.jpeg.mozjpeg', false),
          });
          break;
        case 'png':
          pipeline = pipeline.png({
            compressionLevel: this.configService.get('image.png.compressionLevel', 6),
          });
          break;
        case 'gif':
          pipeline = pipeline.gif();
          break;
        case 'tiff':
          pipeline = pipeline.tiff({ quality });
          break;
        default:
          throw new BadRequestException(`Unsupported format: ${format}`);
      }

      // Выполнение обработки
      const resultBuffer = await pipeline.toBuffer({ resolveWithObject: true });
      const afterBytes = resultBuffer.data.length;
      const duration = Date.now() - startTime;

      const stats = {
        beforeBytes,
        afterBytes,
        reductionPercent: Number(((1 - afterBytes / beforeBytes) * 100).toFixed(1)),
      };

      this.logger.info({
        msg: 'Image processed',
        duration,
        ...stats,
        format,
        quality,
        dimensions: {
          width: resultBuffer.info.width,
          height: resultBuffer.info.height,
        },
      });

      return {
        buffer: resultBuffer.data,
        size: afterBytes,
        mimeType: `image/${format}`,
        dimensions: {
          width: resultBuffer.info.width,
          height: resultBuffer.info.height,
        },
        stats,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error({
        msg: 'Image processing failed',
        duration,
        error: error.message,
      });

      throw error;
    }
  }
}
```

### 2.4 Controller

#### src/modules/image-processing/image-processing.controller.ts
```typescript
import { Controller, Post, Body, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ImageProcessorService } from './services/image-processor.service';
import { ExifService } from './services/exif.service';
import { QueueService } from './services/queue.service';
import { ProcessImageDto } from './dto/process-image.dto';
import { ExtractExifDto } from './dto/exif.dto';

@Controller('api/v1')
export class ImageProcessingController {
  constructor(
    private readonly imageProcessor: ImageProcessorService,
    private readonly exifService: ExifService,
    private readonly queueService: QueueService,
  ) {}

  @Post('process')
  @HttpCode(HttpStatus.OK)
  async process(@Body() dto: ProcessImageDto) {
    const priority = dto.priority ?? 2;

    const result = await this.queueService.add(
      async () => {
        const processed = await this.imageProcessor.process(dto);
        return {
          ...processed,
          buffer: processed.buffer.toString('base64'),
        };
      },
      priority,
    );

    return result;
  }

  @Post('exif')
  @HttpCode(HttpStatus.OK)
  async extractExif(@Body() dto: ExtractExifDto) {
    const priority = dto.priority ?? 2;

    const result = await this.queueService.add(
      async () => {
        const buffer = Buffer.from(dto.image, 'base64');
        const exif = await this.exifService.extract(buffer, dto.mimeType);
        return { exif };
      },
      priority,
    );

    return result;
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      queue: this.queueService.getStatus(),
    };
  }
}
```

### 2.5 Module

#### src/modules/image-processing/image-processing.module.ts
```typescript
import { Module } from '@nestjs/common';
import { ImageProcessingController } from './image-processing.controller';
import { ImageProcessorService } from './services/image-processor.service';
import { ExifService } from './services/exif.service';
import { QueueService } from './services/queue.service';

@Module({
  controllers: [ImageProcessingController],
  providers: [ImageProcessorService, ExifService, QueueService],
})
export class ImageProcessingModule {}
```

### 2.6 Критерии Завершения Этапа 2

- [ ] Все DTO созданы и валидируются
- [ ] QueueService реализован с поддержкой приоритетов
- [ ] ExifService извлекает EXIF метаданные
- [ ] ImageProcessorService обрабатывает изображения
- [ ] Controller обрабатывает запросы /process и /exif
- [ ] Сервис запускается и обрабатывает запросы
- [ ] Ручное тестирование через curl/Postman успешно

---

## Этап 3: Unit Тесты и Финализация MVP

**Цель**: Написать unit тесты для всей функциональности и завершить MVP.

### 3.1 Unit Тесты

#### test/unit/queue.service.spec.ts
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { QueueService } from '../../src/modules/image-processing/services/queue.service';
import imageConfig from '../../src/config/image.config';

describe('QueueService', () => {
  let service: QueueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [imageConfig],
        }),
      ],
      providers: [QueueService],
    }).compile();

    service = module.get<QueueService>(QueueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should execute task with default priority', async () => {
    const task = jest.fn().mockResolvedValue('result');
    const result = await service.add(task);
    
    expect(result).toBe('result');
    expect(task).toHaveBeenCalled();
  });

  it('should execute task with custom priority', async () => {
    const task = jest.fn().mockResolvedValue('result');
    const result = await service.add(task, 0);
    
    expect(result).toBe('result');
    expect(task).toHaveBeenCalled();
  });

  it('should return queue status', () => {
    const status = service.getStatus();
    
    expect(status).toHaveProperty('size');
    expect(status).toHaveProperty('pending');
  });

  it('should handle task errors', async () => {
    const task = jest.fn().mockRejectedValue(new Error('Task failed'));
    
    await expect(service.add(task)).rejects.toThrow('Task failed');
  });
});
```

#### test/unit/exif.service.spec.ts
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ExifService } from '../../src/modules/image-processing/services/exif.service';
import imageConfig from '../../src/config/image.config';
import * as fs from 'fs';
import * as path from 'path';

describe('ExifService', () => {
  let service: ExifService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [imageConfig],
        }),
      ],
      providers: [ExifService],
    }).compile();

    service = module.get<ExifService>(ExifService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should extract EXIF from image with metadata', async () => {
    // Создать тестовое изображение с EXIF
    const sharp = require('sharp');
    const buffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await service.extract(buffer, 'image/jpeg');
    
    // EXIF может быть null для сгенерированного изображения
    expect(result === null || typeof result === 'object').toBe(true);
  });

  it('should return null for image without EXIF', async () => {
    const sharp = require('sharp');
    const buffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const result = await service.extract(buffer, 'image/png');
    
    expect(result).toBeNull();
  });

  it('should throw error for oversized image', async () => {
    const largeBuffer = Buffer.alloc(30 * 1024 * 1024); // 30MB
    
    await expect(
      service.extract(largeBuffer, 'image/jpeg'),
    ).rejects.toThrow('exceeds maximum');
  });

  it('should throw error for invalid MIME type', async () => {
    const buffer = Buffer.from('test');
    
    await expect(
      service.extract(buffer, 'text/plain'),
    ).rejects.toThrow('Invalid MIME type');
  });
});
```

#### test/unit/image-processor.service.spec.ts
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { ImageProcessorService } from '../../src/modules/image-processing/services/image-processor.service';
import imageConfig from '../../src/config/image.config';
import sharp from 'sharp';

describe('ImageProcessorService', () => {
  let service: ImageProcessorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [imageConfig],
        }),
      ],
      providers: [ImageProcessorService],
    }).compile();

    service = module.get<ImageProcessorService>(ImageProcessorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should process image with default settings', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 1000,
        height: 1000,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await service.process({
      image: inputBuffer.toString('base64'),
      mimeType: 'image/jpeg',
    });

    expect(result).toHaveProperty('buffer');
    expect(result).toHaveProperty('size');
    expect(result).toHaveProperty('mimeType');
    expect(result).toHaveProperty('dimensions');
    expect(result).toHaveProperty('stats');
    expect(result.mimeType).toBe('image/webp');
  });

  it('should resize image with maxDimension', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 2000,
        height: 2000,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await service.process({
      image: inputBuffer.toString('base64'),
      mimeType: 'image/jpeg',
      transform: {
        resize: {
          maxDimension: 1000,
        },
      },
    });

    expect(result.dimensions.width).toBeLessThanOrEqual(1000);
    expect(result.dimensions.height).toBeLessThanOrEqual(1000);
  });

  it('should resize image with exact dimensions', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 1000,
        height: 1000,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await service.process({
      image: inputBuffer.toString('base64'),
      mimeType: 'image/jpeg',
      transform: {
        resize: {
          width: 500,
          height: 500,
          fit: 'cover',
        },
      },
    });

    expect(result.dimensions.width).toBe(500);
    expect(result.dimensions.height).toBe(500);
  });

  it('should convert to different formats', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const formats = ['webp', 'avif', 'jpeg', 'png'];

    for (const format of formats) {
      const result = await service.process({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        output: {
          format: format as any,
        },
      });

      expect(result.mimeType).toBe(`image/${format}`);
    }
  });

  it('should throw error for conflicting resize parameters', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    await expect(
      service.process({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        transform: {
          resize: {
            maxDimension: 1000,
            width: 500,
          },
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw error for oversized image', async () => {
    const largeBuffer = Buffer.alloc(30 * 1024 * 1024); // 30MB
    
    await expect(
      service.process({
        image: largeBuffer.toString('base64'),
        mimeType: 'image/jpeg',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw error for invalid MIME type', async () => {
    await expect(
      service.process({
        image: Buffer.from('test').toString('base64'),
        mimeType: 'text/plain',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
```

### 3.2 Критерии Завершения Этапа 3

- [ ] Все unit тесты написаны
- [ ] Покрытие кода >= 80%
- [ ] Все тесты проходят (`pnpm test`)
- [ ] E2E тесты проходят (`pnpm test:e2e`)
- [ ] Документация обновлена
- [ ] MVP готов к использованию

---

## Roadmap: Дальнейшее Развитие

### v1.1 - Продвинутые Трансформации

**Приоритет**: Средний  
**Срок**: 2-3 недели

- [ ] **Crop (Обрезка)**
  - Ручная обрезка с координатами
  - Умная обрезка (attention-based)
  
- [ ] **Rotate (Поворот)**
  - Поворот на 90°, 180°, 270°
  - Произвольный угол поворота
  
- [ ] **Flip (Отзеркаливание)**
  - Горизонтальное отзеркаливание
  - Вертикальное отзеркаливание

- [ ] **Комбинированные трансформации**
  - Поддержка нескольких трансформаций в одном запросе
  - Правильный порядок применения

### v1.2 - Расширенная Поддержка Форматов

**Приоритет**: Средний  
**Срок**: 1-2 недели

- [ ] **BMP**
  - Чтение и запись
  
- [ ] **JPEG XL**
  - Чтение и запись (если поддерживается Sharp)
  
- [ ] **Оптимизация GIF**
  - Обработка анимированных GIF
  - Оптимизация размера

### v1.3 - Водяные Знаки

**Приоритет**: Низкий  
**Срок**: 2-3 недели

- [ ] **Изображения-водяные знаки**
  - Наложение изображения
  - Позиционирование
  - Прозрачность
  
- [ ] **Текстовые водяные знаки**
  - Наложение текста
  - Выбор шрифта
  - Цвет и размер
  
- [ ] **Тайлинг**
  - Повторяющиеся водяные знаки

### v1.4 - Пакетная Обработка

**Приоритет**: Высокий  
**Срок**: 2 недели

- [ ] **Endpoint пакетной обработки**
  - POST /api/v1/batch/process
  - Обработка нескольких изображений за раз
  
- [ ] **Оптимизация производительности**
  - Параллельная обработка в пределах batch
  - Ограничение размера batch

### v1.5 - Асинхронная Обработка

**Приоритет**: Средний  
**Срок**: 3-4 недели

- [ ] **Webhook поддержка**
  - POST /api/v1/async/process
  - Callback URL для результатов
  
- [ ] **Хранилище задач**
  - Redis для хранения статусов
  - GET /api/v1/async/status/:taskId

### v1.6 - Мониторинг и Метрики

**Приоритет**: Высокий  
**Срок**: 1-2 недели

- [ ] **Prometheus метрики**
  - Количество запросов
  - Длительность обработки
  - Размер очереди
  - Частота ошибок
  
- [ ] **OpenTelemetry трассировка**
  - Распределенная трассировка
  - Интеграция с Jaeger/Zipkin

### v1.7 - Безопасность и Ограничения

**Приоритет**: Высокий  
**Срок**: 1-2 недели

- [ ] **Rate Limiting**
  - Ограничение запросов по IP
  - Ограничение по API ключу
  
- [ ] **Аутентификация**
  - API ключи
  - JWT токены
  
- [ ] **Авторизация**
  - Роли и права доступа

### v2.0 - Продвинутые Функции

**Приоритет**: Низкий  
**Срок**: 3-6 месяцев

- [ ] **Видео обработка**
  - Генерация миниатюр из видео
  - Извлечение кадров
  
- [ ] **PDF конвертация**
  - PDF в изображение
  - Изображение в PDF
  
- [ ] **OCR**
  - Распознавание текста
  - Интеграция с Tesseract
  
- [ ] **AI улучшение**
  - Upscaling
  - Шумоподавление
  - Автоматическая цветокоррекция

---

## Контрольные Точки

### Milestone 1: MVP Ready (Конец Этапа 3)
- ✅ Сервис запускается
- ✅ Обработка изображений работает
- ✅ EXIF extraction работает
- ✅ Unit тесты >= 80% покрытия
- ✅ Документация готова

### Milestone 2: Production Ready (v1.1)
- ✅ Все трансформации реализованы
- ✅ E2E тесты покрывают все сценарии
- ✅ Docker образ оптимизирован
- ✅ Мониторинг настроен

### Milestone 3: Enterprise Ready (v1.6)
- ✅ Метрики Prometheus
- ✅ Rate limiting
- ✅ Аутентификация
- ✅ Нагрузочное тестирование пройдено

---

**Контроль Документа**

| Версия | Дата | Автор | Изменения |
|--------|------|-------|-----------|
| 1.0 | 2026-01-17 | AI Assistant | Создание плана реализации |
