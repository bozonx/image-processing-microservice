# Микросервис Обработки Изображений

Высокопроизводительный микросервис для обработки изображений на базе NestJS и Sharp.

## Возможности

- ✅ Конвертация форматов (WebP, AVIF, JPEG, PNG, GIF, TIFF)
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
      "width": 1000,
      "height": 1000,
      "fit": "cover"
    },
    "crop": {
      "left": 100,
      "top": 100,
      "width": 500,
      "height": 500
    },
    "rotate": 90,
    "flip": true,
    "autoRotate": true
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

### v1.1 (Фаза 2) - В процессе
- [ ] Поддержка всех форматов (BMP, JPEG XL)
- [x] Продвинутые трансформации (crop, rotate, flip)
- [ ] Умная обрезка (Smart Crop)
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
