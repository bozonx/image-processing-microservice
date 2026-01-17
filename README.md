# Микросервис Обработки Изображений

Высокопроизводительный микросервис для обработки изображений на базе NestJS и Sharp.

## Возможности

- ✅ Входные форматы: WebP, AVIF, JPEG, PNG, GIF, TIFF, BMP
- ✅ Выходные форматы: WebP, AVIF, JPEG, PNG, GIF (включая анимации), TIFF
- ✅ Извлечение EXIF метаданных
- ✅ Изменение размера с различными режимами fit
- ✅ Обрезка, поворот, отзеркаливание
- ✅ Автоповорот на основе EXIF (autoOrient)
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

**Детали `resize`:**
- `maxDimension` (number): Ограничение большей стороны (пропорции сохраняются). Нельзя использовать вместе с `width`/`height`.
- `width` / `height` (number): Явное указание размеров.
- `fit` (string): Режим вписывания:
  - `cover`: (по умолчанию) Сохраняет пропорции, обрезает лишнее, чтобы заполнить указанные размеры.
  - `contain`: Сохраняет пропорции, вписывает изображение целиком, добавляя пустые поля ("letterboxing") если нужно.
  - `fill`: Игнорирует пропорции, растягивает изображение точно под указанные размеры.
  - `inside`: Сохраняет пропорции, делает изображение максимально большим, чтобы оно не выходило за границы.
  - `outside`: Сохраняет пропорции, делает изображение максимально маленьким, чтобы оно полностью закрывало границы.
- `withoutEnlargement` (boolean): Не увеличивать изображение, если оно меньше целевых размеров. По умолчанию: `true`.
- `autoOrient` (boolean): Автоматический поворот и отзеркаливание на основе EXIF Meta данных (Orientation tag). По умолчанию: `true`.
- `position` (string): Точка привязки для `cover` или `contain`:
  - Направления: `center` (по умолчанию), `top`, `right`, `bottom`, `left`, `right top`, `right bottom`, `left bottom`, `left top`.
  - Стратегии обрезки: `entropy` (по фокусу на детализации), `attention` (по наиболее значимой области).

**Детали `crop`:**
- `left`, `top`, `width`, `height` (number): Координаты и размеры области обрезки.

#### Объект `output` (Вывод):

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

- `LISTEN_PORT` - Порт сервиса (default: 3000)
- `LOG_LEVEL` - Уровень логирования (default: info)
- `FILE_MAX_BYTES_MB` - Максимальный размер входного файла в MB (default: 25)
- `HEAVY_TASKS_MAX_CONCURRENCY` - Количество параллельных задач (default: 4)
- `HEAVY_TASKS_QUEUE_TIMEOUT_MS` - Таймаут ожидания в очереди в мс (default: 30000)

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
- [ ] Опциональная поддержка BMP на запись (требует доп. библиотек)
- [ ] Опциональная поддержка JPEG XL (требует кастомной сборки libvips)
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
