# Микросервис Обработки Изображений

Высокопроизводительный микросервис для обработки изображений на базе NestJS и Sharp.

## Содержание

- [Возможности](#возможности)
- [Поддерживаемые Форматы](#поддерживаемые-форматы)
- [Требования](#требования)
- [Быстрый Старт](#быстрый-старт)
  - [Локальная Разработка](#локальная-разработка)
  - [Web UI для Тестирования](#web-ui-для-тестирования)
  - [Production Сборка](#production-сборка)
  - [Docker](#docker)
- [API Endpoints](#api-endpoints)
  - [POST /api/v1/process](#post-apiv1process)
  - [POST /api/v1/exif](#post-apiv1exif)
  - [GET /api/v1/health](#get-apiv1health)
- [Конфигурация](#конфигурация)
- [Тестирование](#тестирование)
- [Архитектура](#архитектура)
- [Производительность](#производительность)
- [FAQ](#faq-часто-задаваемые-вопросы)
- [Мониторинг](#мониторинг)
- [Интеграция](#интеграция)
- [Статус Разработки](#статус-разработки)
- [Roadmap](#roadmap)
- [Лицензия](#лицензия)

## Возможности

- ✅ **Входные форматы**: JPEG, PNG, WebP, AVIF, GIF (включая анимированные), TIFF, BMP
- ✅ **Выходные форматы**: JPEG, PNG, WebP, AVIF, GIF (включая анимированные), TIFF
- ✅ Извлечение EXIF метаданных
- ✅ Изменение размера с различными режимами fit
- ✅ Обрезка, поворот, отзеркаливание
- ✅ Автоповорот на основе EXIF (autoOrient)
- ✅ Управление очередью задач с приоритетами
- ✅ Graceful shutdown

## Поддерживаемые Форматы

### Входные Форматы

Микросервис поддерживает чтение следующих форматов:

- **JPEG** (.jpg, .jpeg) - стандартный формат для фотографий
- **PNG** (.png) - формат с поддержкой прозрачности
- **WebP** (.webp) - современный формат от Google
- **AVIF** (.avif) - новейший формат с отличным сжатием
- **GIF** (.gif) - включая анимированные изображения
- **TIFF** (.tif, .tiff) - формат для профессиональной фотографии
- **BMP** (.bmp) - только чтение (запись не поддерживается)

### Выходные Форматы

Микросервис может конвертировать изображения в следующие форматы:

- **JPEG** - оптимален для фотографий, поддержка mozjpeg для лучшего сжатия
- **PNG** - для изображений с прозрачностью, поддержка палитры (pngquant-like)
- **WebP** - универсальный формат с отличным сжатием (lossy/lossless)
- **AVIF** - наилучшее сжатие, но медленнее обработка
- **GIF** - включая анимированные изображения
- **TIFF** - для профессиональных нужд

**Примечание**: BMP и JPEG XL в настоящее время не поддерживаются для записи. Для их поддержки требуются дополнительные библиотеки или кастомная сборка libvips.

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

Сервис будет доступен по адресу: `http://localhost:8080/api/v1`

### Web UI для Тестирования

После запуска сервиса, откройте браузер и перейдите по адресу: `http://localhost:8080/`

Web UI предоставляет удобный интерфейс для тестирования всех возможностей микросервиса:

#### Основные возможности:

- **Process Image** - обработка изображений с полным набором параметров:
  - Изменение размера (resize) с различными режимами fit
  - Обрезка (crop) с точным указанием координат
  - Поворот и отзеркаливание (rotate, flip, flop)
  - Автоповорот на основе EXIF (autoOrient)
  - Конвертация между форматами
  - Настройка качества и сжатия
  - Продвинутые параметры (effort, compression level, chroma subsampling и др.)

- **Extract EXIF** - извлечение метаданных из изображений
  - Информация о камере и настройках съемки
  - Дата и время создания
  - Геолокация (если доступна)
  - Ориентация изображения

#### Особенности интерфейса:

- **Премиум дизайн** с современными градиентами и анимациями
- **Drag & Drop** для удобной загрузки изображений
- **Превью** оригинального и обработанного изображения side-by-side
- **Детальная статистика**: размер файла, степень сжатия, размеры изображения
- **Статус сервиса** в реальном времени (health check)
- **Информация об очереди** задач (размер очереди, задачи в обработке)
- **Возможность скачать** обработанное изображение

Подробнее см. [docs/WEB_UI.md](docs/WEB_UI.md)


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

Сервис будет доступен по адресу: `http://localhost:8080/api/v1`

## API Endpoints

### POST /api/v1/process

Основной эндпоинт для обработки изображений. Позволяет изменять размер, обрезать, поворачивать и конвертировать изображения в различные форматы.

**Параметры запроса (JSON):**

| Параметр | Тип | Описание |
| :--- | :--- | :--- |
| `image` | `string` | **Обязательно.** Изображение в формате Base64. |
| `mimeType` | `string` | **Обязательно.** MIME-тип входного изображения (например, `image/jpeg`). |
| `priority` | `number` | Приоритет задачи: `0` (высокий), `1` (средний), `2` (низкий). По умолчанию: `2`. |
| `transform` | `object` | Параметры трансформации (см. ниже). |
| `output` | `object` | Параметры выходного формата (см. ниже). |

#### Объект `transform` (Трансформации):

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `resize` | `object` | Изменение размера. Поля: `width`, `height`, `maxDimension`, `fit`, `withoutEnlargement`, `position`. |
| `crop` | `object` | Обрезка. Поля: `left`, `top`, `width`, `height`. |
| `autoOrient` | `boolean` | Автоматический поворот и отзеркаливание на основе EXIF данных. Выполняется **до** остальных трансформаций. Если включено, сбрасывает тег ориентации EXIF. Если выключено — EXIF данные игнорируются. |
| `rotate` | `number` | Явный поворот на угол в градусах (-360 до 360). Применяется **после** `autoOrient`. |
| `flip` | `boolean` | Отзеркалить по вертикали. Применяется **после** `autoOrient`. |
| `flop` | `boolean` | Отзеркалить по горизонтали. Применяется **после** `autoOrient`. |
| `backgroundColor` | `string` | Цвет фона (hex, name). Используется для удаления прозрачности (наложения на фон). |

**Детали `resize`:**
- `maxDimension` (number): Ограничение большей стороны (пропорции сохраняются). Нельзя использовать вместе с `width`/`height`.
- `width` / `height` (number): Явное указание размеров.
- `fit` (string): Режим вписывания:
  - `cover`: Сохраняет пропорции, обрезает лишнее, чтобы заполнить указанные размеры.
  - `contain`: Сохраняет пропорции, вписывает изображение целиком, добавляя пустые поля ("letterboxing") если нужно.
  - `fill`: Игнорирует пропорции, растягивает изображение точно под указанные размеры.
  - `inside`: (по умолчанию) Сохраняет пропорции, делает изображение максимально большим, чтобы оно не выходило за границы.
  - `outside`: Сохраняет пропорции, делает изображение максимально маленьким, чтобы оно полностью закрывало границы.
- `withoutEnlargement` (boolean): Не увеличивать изображение, если оно меньше целевых размеров. По умолчанию: `true`.
- `position` (string): Точка привязки для `cover` или `contain`:
  - Направления: `center` (по умолчанию), `top`, `right`, `bottom`, `left`, `right top`, `right bottom`, `left bottom`, `left top`.
  - Стратегии обрезки: `entropy` (по фокусу на детализации), `attention` (по наиболее значимой области).

**Детали `crop`:**
- `left`, `top`, `width`, `height` (number): Координаты и размеры области обрезки.

#### Объект `output` (Вывод):

> **Важно:** Если объект `output` не передан, будут применены настройки по умолчанию из конфигурации сервера (обычно конвертация в `WebP` с качеством `80`), даже если параметры трансформации (resize, rotate и т.д.) были указаны. Чтобы сохранить исходный формат, необходимо явно передать его в поле `format`.

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `format` | `string` | Выходной формат: `webp`, `avif`, `jpeg`, `png`, `gif`, `tiff`. |
| `quality` | `number` | Качество сжатия (1-100). |
| `lossless` | `boolean` | Использовать ли сжатие без потерь (для WebP/AVIF). |
| `stripMetadata` | `boolean` | Удалить метаданные (EXIF и др.). |
| `effort` | `number` | Уровень усилий при сжатии (0-9). Чем выше, тем медленнее, но файл меньше. |
| `progressive` | `boolean` | Использовать прогрессивную развертку (для JPEG). |
| `mozjpeg` | `boolean` | Использовать библиотеку mozjpeg для лучшего сжатия (для JPEG). |
| `compressionLevel` | `number` | Уровень сжатия (0-9) для PNG. Чем выше, тем медленнее, но файл меньше. |
| `chromaSubsampling` | `string` | Цветовая субдискретизация для AVIF и JPEG (например, `4:2:0`, `4:4:4`). |
| `palette` | `boolean` | Использовать квантование палитры (аналог pngquant) для PNG. Включается автоматически, если задан `quality`. |
| `colors` | `number` | Максимальное количество цветов в палитре (2-256) для PNG. |
| `dither` | `number` | Уровень диффузии ошибок Floyd-Steinberg (0.0 - 1.0) для PNG. |
| `adaptiveFiltering` | `boolean` | Использовать адаптивную фильтрацию строк для PNG. |

**Пример запроса:**
```json
{
  "image": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "mimeType": "image/png",
  "priority": 1,
  "transform": {
    "resize": {
      "width": 800,
      "height": 600,
      "fit": "cover"
    },
    "autoOrient": true
  },
  "output": {
    "format": "webp",
    "quality": 85,
    "stripMetadata": true
  }
}
```

**Ответ:**
```json
{
  "buffer": "...", // Результирующее изображение в Base64
  "size": 42560,
  "mimeType": "image/webp",
  "dimensions": {
    "width": 800,
    "height": 600
  },
  "stats": {
    "beforeBytes": 125000,
    "afterBytes": 42560,
    "reductionPercent": 65.95
  }
}
```

---

### POST /api/v1/exif

Извлечение метаданных EXIF без обработки самого изображения.

**Параметры запроса (JSON):**

| Параметр | Тип | Описание |
| :--- | :--- | :--- |
| `image` | `string` | **Обязательно.** Изображение в формате Base64. |
| `mimeType` | `string` | **Обязательно.** MIME-тип входного изображения (например, `image/jpeg`). |
| `priority` | `number` | Приоритет задачи: `0` (высокий), `1` (средний), `2` (низкий). |

**Ответ:**
```json
{
  "exif": {
    "Make": "Canon",
    "Model": "EOS 5D Mark IV",
    "DateTimeOriginal": "2024:01:15 14:30:00",
    "ExposureTime": 0.004,
    "FNumber": 2.8,
    "ISO": 400,
    "Orientation": 1
  }
}
```

---

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

- `NODE_ENV` - Окружение: `development` или `production` (default: production)
- `LISTEN_HOST` - Хост для прослушивания (default: 0.0.0.0)
- `LISTEN_PORT` - Порт сервиса (default: 8080)
- `BASE_PATH` - Базовый путь для API (опционально)
- `LOG_LEVEL` - Уровень логирования: `trace`, `debug`, `info`, `warn`, `error` (default: info)
- `TZ` - Временная зона (default: UTC)
- `FILE_MAX_BYTES_MB` - Максимальный размер входного файла в MB (default: 25)
- `HEAVY_TASKS_MAX_CONCURRENCY` - Количество параллельных задач обработки (default: 4)
- `HEAVY_TASKS_QUEUE_TIMEOUT_MS` - Таймаут ожидания задачи в очереди в мс (default: 30000)
- `HEAVY_TASKS_REQUEST_TIMEOUT_MS` - Таймаут выполнения запроса в мс (default: 60000)
- `SHUTDOWN_TIMEOUT_MS` - Таймаут graceful shutdown в мс (default: 30000)

## Тестирование

### Unit Тесты
```bash
pnpm test:unit
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

### Технологический Стек

- **Framework**: NestJS 11 - модульная архитектура с dependency injection
- **HTTP Server**: Fastify - высокопроизводительная альтернатива Express
- **Image Processing**: Sharp 0.34 - быстрая библиотека на базе libvips
- **EXIF Extraction**: exifr 7 - полнофункциональная библиотека для метаданных
- **Queue Management**: p-queue 9 - управление приоритетами и конкурентностью
- **Logging**: Pino + nestjs-pino - структурированное логирование
- **Validation**: class-validator + class-transformer - валидация DTO
- **Configuration**: @nestjs/config - типобезопасная конфигурация
- **Testing**: Jest 30 - unit и e2e тесты

### Модульная Структура

```
src/
├── modules/
│   ├── health/              # Health check endpoint
│   │   ├── health.controller.ts
│   │   └── health.module.ts
│   └── image-processing/    # Основная логика обработки
│       ├── dto/             # Data Transfer Objects
│       ├── services/
│       │   ├── image-processor.service.ts  # Обработка изображений
│       │   ├── exif.service.ts            # Извлечение EXIF
│       │   └── queue.service.ts           # Управление очередью
│       ├── image-processing.controller.ts
│       └── image-processing.module.ts
├── config/                  # Конфигурация приложения
│   ├── app.config.ts
│   └── image.config.ts
├── common/                  # Общие утилиты
└── main.ts                  # Точка входа
```

### Ключевые Компоненты

#### ImageProcessorService
- Обработка изображений через Sharp
- Применение трансформаций (resize, crop, rotate, flip/flop)
- Конвертация форматов с оптимизацией
- Управление метаданными (strip/preserve)
- Поддержка анимированных GIF

#### ExifService
- Извлечение метаданных через exifr
- Поддержка всех основных EXIF тегов
- Обработка GPS данных
- Информация о камере и настройках съемки

#### QueueService
- Управление очередью задач с приоритетами (0-2)
- Ограничение конкурентности (default: 4 задачи)
- Таймауты на уровне задачи (30s) и запроса (60s)
- Graceful shutdown с ожиданием завершения задач
- Мониторинг размера очереди и активных задач

### Очередь Задач

Сервис использует `p-queue` для управления параллельными задачами:
- **Приоритеты**: 0 (высокий), 1 (средний), 2 (низкий)
- **Таймаут на задачу**: 30 секунд (настраивается через `HEAVY_TASKS_QUEUE_TIMEOUT_MS`)
- **Таймаут запроса**: 60 секунд (настраивается через `HEAVY_TASKS_REQUEST_TIMEOUT_MS`)
- **Graceful shutdown**: ожидание завершения текущих задач при остановке сервиса
- **Мониторинг**: доступ к размеру очереди и количеству активных задач через `/health`

### Обработка Ошибок

- Валидация входных данных через class-validator
- Проверка размера файла (default: 25MB)
- Проверка MIME типов
- Graceful error handling с детальными сообщениями
- Структурированное логирование ошибок

## Производительность

### SLA (Service Level Agreement)

Целевые показатели производительности (p95):

- **EXIF extraction**: < 500ms
- **Обработка без трансформаций**: < 1s
- **Обработка с resize**: < 2s
- **Обработка с AVIF (effort=6)**: < 5s

### Рекомендации по Конфигурации

#### Минимальные Требования
- CPU: 2 ядра
- Memory: 2GB RAM
- `HEAVY_TASKS_MAX_CONCURRENCY=2`

#### Рекомендуемые Требования
- CPU: 4 ядра
- Memory: 4GB RAM
- `HEAVY_TASKS_MAX_CONCURRENCY=4`

#### Высокая Нагрузка
- CPU: 8+ ядер
- Memory: 8GB+ RAM
- `HEAVY_TASKS_MAX_CONCURRENCY=8`

### Оптимизация

**Общие рекомендации:**
- Устанавливайте `HEAVY_TASKS_MAX_CONCURRENCY` равным количеству CPU ядер
- Для AVIF используйте `effort=4-6` (баланс скорость/качество)
- Для WebP используйте `effort=4` для быстрой обработки
- Включайте `stripMetadata=true` для уменьшения размера файлов
- Используйте `withoutEnlargement=true` чтобы избежать увеличения маленьких изображений

**Выбор формата:**
- **WebP**: лучший баланс скорость/качество для веба
- **AVIF**: максимальное сжатие, но медленнее обработка
- **JPEG**: быстрая обработка, хорошо для фотографий
- **PNG**: для изображений с прозрачностью

**Приоритеты:**
- Используйте `priority=0` для критичных задач (пользовательские запросы)
- Используйте `priority=2` для фоновых задач (предварительная обработка)

## FAQ (Часто Задаваемые Вопросы)

### Общие Вопросы

**Q: Почему нужно указывать `mimeType` в запросе?**  
A: MIME-тип необходим для корректной обработки изображения библиотекой Sharp. Это позволяет правильно интерпретировать входные данные и применить специфичные для формата оптимизации (например, поддержка анимации для GIF).

**Q: Сохраняется ли прозрачность при конвертации?**  
A: Да, прозрачность сохраняется при конвертации между форматами, которые её поддерживают (PNG, WebP, AVIF). Если вы конвертируете в формат без поддержки прозрачности (JPEG), используйте параметр `backgroundColor` для указания цвета фона.

**Q: Поддерживаются ли анимированные изображения?**  
A: Да, микросервис полностью поддерживает анимированные GIF как на входе, так и на выходе. Все кадры анимации обрабатываются корректно.

**Q: Какой максимальный размер изображения можно обработать?**  
A: По умолчанию максимальный размер файла - 25MB (настраивается через `FILE_MAX_BYTES_MB`). Учтите, что при Base64 кодировании размер увеличивается примерно на 33%, поэтому `bodyLimit` автоматически устанавливается в 1.5x от `FILE_MAX_BYTES_MB`.

### Трансформации

**Q: В каком порядке применяются трансформации?**  
A: Порядок применения трансформаций:
1. `autoOrient` - автоповорот на основе EXIF
2. `crop` - обрезка области
3. `resize` - изменение размера
4. `flip` / `flop` - отзеркаливание
5. `rotate` - явный поворот
6. `backgroundColor` - удаление прозрачности

**Q: Что делает параметр `autoOrient`?**  
A: `autoOrient` автоматически поворачивает и отзеркаливает изображение на основе EXIF тега Orientation. Это полезно для фотографий с камер и смартфонов. После применения тег Orientation сбрасывается.

**Q: Чем отличаются режимы `fit`?**  
A: 
- `inside` (по умолчанию) - вписывает изображение в указанные размеры, сохраняя пропорции
- `cover` - заполняет указанные размеры, обрезая лишнее
- `contain` - вписывает изображение целиком, добавляя поля
- `fill` - растягивает изображение, игнорируя пропорции
- `outside` - делает изображение минимально возможным, чтобы покрыть указанные размеры

### Форматы и Качество

**Q: Какой формат выбрать для веба?**  
A: Рекомендуем WebP с `quality=80-85` как лучший баланс размера и качества. Для максимального сжатия используйте AVIF, но учтите более медленную обработку.

**Q: Что такое `effort` и как его настроить?**  
A: `effort` (0-9) определяет, сколько времени тратится на оптимизацию сжатия. Большие значения дают меньший размер файла, но медленнее обрабатываются. Рекомендуем:
- `effort=4` для быстрой обработки
- `effort=6` для баланса (по умолчанию)
- `effort=9` для максимального сжатия

**Q: Что такое chroma subsampling?**  
A: Chroma subsampling - техника сжатия, которая уменьшает цветовую информацию. `4:2:0` даёт меньший размер файла, `4:4:4` - максимальное качество. Используется для JPEG и AVIF.

### Производительность

**Q: Как ускорить обработку?**  
A:
- Используйте WebP вместо AVIF
- Уменьшите `effort` (например, до 4)
- Используйте `stripMetadata=true`
- Увеличьте `HEAVY_TASKS_MAX_CONCURRENCY` (до количества CPU ядер)
- Для JPEG включите `mozjpeg=false` (быстрее, но хуже сжатие)

**Q: Почему обработка AVIF медленнее?**  
A: AVIF - новый формат с очень эффективным, но вычислительно сложным алгоритмом сжатия. Это нормально. Для ускорения уменьшите `effort` или используйте WebP.

**Q: Что делать при ошибке "413 Payload Too Large"?**  
A: Увеличьте `FILE_MAX_BYTES_MB` в конфигурации. Сервис автоматически настроит `bodyLimit` в 1.5x от этого значения для учёта Base64 кодирования.

### Мониторинг и Отладка

**Q: Как проверить статус сервиса?**  
A: Используйте эндпоинт `/api/v1/health`. Он возвращает статус сервиса, размер очереди и количество задач в обработке.

**Q: Где посмотреть логи?**  
A: Логи выводятся в stdout в JSON формате (Pino). В development режиме используется `pino-pretty` для читаемого вывода. В production логи структурированы для парсинга системами мониторинга.

**Q: Как работает graceful shutdown?**  
A: При получении сигнала SIGTERM/SIGINT сервис:
1. Прекращает принимать новые запросы
2. Ждёт завершения текущих задач в очереди (до `SHUTDOWN_TIMEOUT_MS`)
3. Корректно закрывает все соединения
4. Завершает работу

## Мониторинг

### Health Check

```bash
curl http://localhost:8080/api/v1/health
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

### Пример с cURL

```bash
# Обработка изображения с изменением размера и конвертацией в WebP
curl -X POST http://localhost:8080/api/v1/process \
  -H "Content-Type: application/json" \
  -d '{
    "image": "'$(base64 -w 0 input.jpg)'",
    "mimeType": "image/jpeg",
    "priority": 1,
    "transform": {
      "resize": {
        "width": 800,
        "height": 600,
        "fit": "cover"
      },
      "autoOrient": true
    },
    "output": {
      "format": "webp",
      "quality": 85,
      "stripMetadata": true
    }
  }'

# Извлечение EXIF метаданных
curl -X POST http://localhost:8080/api/v1/exif \
  -H "Content-Type: application/json" \
  -d '{
    "image": "'$(base64 -w 0 photo.jpg)'",
    "mimeType": "image/jpeg"
  }'

# Health check
curl http://localhost:8080/api/v1/health
```

### Пример с fetch (Node.js)

```typescript
import { readFile, writeFile } from 'fs/promises';

async function processImage() {
  // Читаем изображение
  const imageBuffer = await readFile('input.jpg');
  
  // Отправляем на обработку
  const response = await fetch('http://localhost:8080/api/v1/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: imageBuffer.toString('base64'),
      mimeType: 'image/jpeg',
      priority: 1,
      transform: {
        resize: {
          maxDimension: 1920,
          fit: 'inside',
          withoutEnlargement: true,
        },
        autoOrient: true,
      },
      output: {
        format: 'webp',
        quality: 85,
        effort: 6,
        stripMetadata: true,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  
  // Сохраняем результат
  const processedImage = Buffer.from(result.buffer, 'base64');
  await writeFile('output.webp', processedImage);
  
  console.log('Image processed successfully!');
  console.log(`Original size: ${result.stats.beforeBytes} bytes`);
  console.log(`Processed size: ${result.stats.afterBytes} bytes`);
  console.log(`Reduction: ${result.stats.reductionPercent}%`);
  console.log(`Dimensions: ${result.dimensions.width}x${result.dimensions.height}`);
}

processImage().catch(console.error);
```

### Пример с Python

```python
import base64
import requests
import json

def process_image(input_path: str, output_path: str):
    # Читаем изображение и кодируем в base64
    with open(input_path, 'rb') as f:
        image_data = base64.b64encode(f.read()).decode('utf-8')
    
    # Подготавливаем запрос
    payload = {
        'image': image_data,
        'mimeType': 'image/jpeg',
        'priority': 1,
        'transform': {
            'resize': {
                'width': 800,
                'height': 600,
                'fit': 'cover'
            },
            'autoOrient': True
        },
        'output': {
            'format': 'webp',
            'quality': 85,
            'stripMetadata': True
        }
    }
    
    # Отправляем запрос
    response = requests.post(
        'http://localhost:8080/api/v1/process',
        json=payload,
        headers={'Content-Type': 'application/json'}
    )
    
    response.raise_for_status()
    result = response.json()
    
    # Сохраняем результат
    processed_data = base64.b64decode(result['buffer'])
    with open(output_path, 'wb') as f:
        f.write(processed_data)
    
    print(f"Image processed successfully!")
    print(f"Original size: {result['stats']['beforeBytes']} bytes")
    print(f"Processed size: {result['stats']['afterBytes']} bytes")
    print(f"Reduction: {result['stats']['reductionPercent']}%")
    print(f"Dimensions: {result['dimensions']['width']}x{result['dimensions']['height']}")

if __name__ == '__main__':
    process_image('input.jpg', 'output.webp')
```

### Пример с TypeScript SDK

```typescript
class ImageProcessingClient {
  constructor(private baseUrl: string = 'http://localhost:8080/api/v1') {}

  async processImage(options: {
    image: Buffer;
    mimeType: string;
    priority?: number;
    transform?: any;
    output?: any;
  }) {
    const response = await fetch(`${this.baseUrl}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: options.image.toString('base64'),
        mimeType: options.mimeType,
        priority: options.priority ?? 2,
        transform: options.transform,
        output: options.output,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Processing failed: ${error.message}`);
    }

    const result = await response.json();
    return {
      buffer: Buffer.from(result.buffer, 'base64'),
      size: result.size,
      mimeType: result.mimeType,
      dimensions: result.dimensions,
      stats: result.stats,
    };
  }

  async extractExif(image: Buffer, mimeType: string) {
    const response = await fetch(`${this.baseUrl}/exif`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: image.toString('base64'),
        mimeType,
      }),
    });

    if (!response.ok) {
      throw new Error(`EXIF extraction failed: ${response.statusText}`);
    }

    return response.json();
  }

  async healthCheck() {
    const response = await fetch(`${this.baseUrl}/health`);
    return response.json();
  }
}

// Использование
const client = new ImageProcessingClient();
const imageBuffer = await readFile('photo.jpg');

const result = await client.processImage({
  image: imageBuffer,
  mimeType: 'image/jpeg',
  priority: 0, // высокий приоритет
  transform: {
    resize: { maxDimension: 2048 },
    autoOrient: true,
  },
  output: {
    format: 'avif',
    quality: 80,
    effort: 6,
  },
});

await writeFile('output.avif', result.buffer);
```

## Статус Разработки

### ✅ Этап 1: Подготовка Инфраструктуры (Завершен)
- [x] Файловая структура проекта
- [x] Настройка зависимостей
- [x] Переменные окружения
- [x] Docker конфигурация
- [x] README.md на русском
- [x] Базовые тесты
- [x] Сервис запускается

### ✅ Этап 2: Реализация MVP (Завершен)
- [x] Конфигурация обработки изображений
- [x] DTO для валидации
- [x] QueueService с приоритетами
- [x] ExifService
- [x] ImageProcessorService
- [x] ImageProcessingController
- [x] Ручное тестирование

### ✅ Этап 3: Unit Тесты и Финализация MVP (Завершен)
- [x] Тесты ImageProcessorService
- [x] Тесты ExifService
- [x] Тесты QueueService
- [x] Тесты ImageProcessingController
- [x] E2E тесты функциональности
- [x] Покрытие кода 80%+

## Roadmap

### v1.1 (Фаза 2) - Планируется
- [ ] Опциональная поддержка BMP на запись (требует доп. библиотек)
- [ ] Опциональная поддержка JPEG XL (требует кастомной сборки libvips)
- [ ] Умная обрезка (Smart Crop) с использованием entropy/attention
- [ ] Водяные знаки (watermarks)
- [ ] Поддержка ICC профилей

### v1.2 (Фаза 3)
- [ ] Пакетная обработка нескольких изображений
- [ ] Асинхронная обработка с webhooks для уведомлений
- [ ] Prometheus метрики для мониторинга
- [ ] Rate limiting для защиты от перегрузки
- [ ] Кэширование результатов обработки

## Лицензия

MIT

## Поддержка

Для вопросов и предложений создавайте issue в репозитории.
