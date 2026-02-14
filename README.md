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

- ✅ **Входные форматы**: JPEG, PNG, WebP, AVIF, GIF (включая анимированные), TIFF, BMP, SVG
- ✅ **Выходные форматы**: JPEG, PNG, WebP, AVIF, GIF (включая анимированные), TIFF, RAW (uncompressed)
- ✅ Извлечение EXIF метаданных
- ✅ Изменение размера с различными режимами fit
- ✅ Обрезка, поворот, отзеркаливание
- ✅ Автоповорот на основе EXIF (autoOrient)
- ✅ Удаление прозрачности и заливка фоном (flatten)
- ✅ **Водяные знаки** (графические, включая SVG) с режимами single и tile
- ✅ Продвинутые параметры сжатия (MozJPEG, Chroma Subsampling, PNG palette)
- ✅ Управление очередью задач с приоритетами
- ✅ Полностью потоковая (streaming) обработка данных
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
- **RAW** - несжатые пиксельные данные (raw pixel data)

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

После запуска сервиса, откройте браузер и перейдите по адресу: `http://localhost:8080/ui`

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

Основной эндпоинт для обработки изображений. Использует потоковую передачу данных через `multipart/form-data`, что позволяет эффективно обрабатывать файлы любого размера.

**Параметры запроса (multipart/form-data):**

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `file` | `File` | **Обязательно.** Файл изображения (binary). |
| `params` | `JSON string` | **Опционально.** Параметры обработки в формате JSON (см. ниже). |

#### Параметры `params` (JSON):

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `priority` | `number` | Приоритет задачи: `0` (высокий), `1` (средний), `2` (низкий). По умолчанию: `2`. |
| `transform` | `object` | Параметры трансформации (resize, crop, rotate и т.д.). |
| `output` | `object` | Параметры выходного формата (format, quality и т.д.). |

#### Объект `transform` (Трансформации):

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `resize` | `object` | Изменение размера. Поля: `width`, `height`, `maxDimension`, `fit`, `withoutEnlargement`, `position`. |
| `crop` | `object` | Обрезка. Поля: `left`, `top`, `width`, `height`. |
| `autoOrient` | `boolean` | Автоматический поворот на основе EXIF. По умолчанию: `true`. |
| `rotate` | `number` | Явный поворот на угол (-360 до 360). |
| `flip` | `boolean` | Отзеркалить по вертикали. |
| `flop` | `boolean` | Отзеркалить по горизонтали. |
| `flatten` | `string` | Удалить альфа-канал и заменить прозрачность на указанный цвет фона (hex). |
| `watermark` | `object` | Настройки водяного знака. Поля: `position`, `opacity`, `scale`, `mode`, `spacing`. |

#### Объект `watermark` (Водяной знак):

**Важно**: При использовании водяного знака необходимо загрузить файл водяного знака в поле `watermark` формы.

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `position` | `string` | Позиция водяного знака: `northwest`, `north`, `northeast`, `west`, `center`, `east`, `southwest`, `south`, `southeast`. По умолчанию: `southeast`. Игнорируется в режиме `tile`. |
| `opacity` | `number` | Прозрачность водяного знака (0-1). По умолчанию: `1.0`. |
| `scale` | `number` | Размер водяного знака в процентах от меньшей стороны основного изображения (1-100). По умолчанию: `10`. **Важно**: водяной знак не растягивается больше своего исходного размера для сохранения качества. |
| `mode` | `string` | Режим наложения: `single` (одиночный) или `tile` (повторяющийся). По умолчанию: `single`. |
| `spacing` | `number` | Отступ между повторениями в режиме `tile` (в пикселях). По умолчанию: `0`. |

**Поддерживаемые форматы водяных знаков**: PNG, SVG, WebP, AVIF (рекомендуется PNG или SVG с прозрачностью).

**Важно для SVG**: Текст в SVG должен быть преобразован в кривые (paths), иначе могут возникнуть проблемы с отображением шрифтов.

#### Объект `output` (Вывод):

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `format` | `string` | Выходной формат: `webp`, `avif`, `jpeg`, `png`, `gif`, `tiff`, `raw`. |
| `quality` | `number` | Качество сжатия (1-100). |
| `lossless` | `boolean` | Сжатие без потерь (для WebP/AVIF). |
| `effort` | `number` | Уровень усилий при сжатии (0-9). |
| `stripMetadata` | `boolean` | Удалить метаданные. |
| `progressive` | `boolean` | Использовать прогрессивную развертку (для JPEG). |
| `mozjpeg` | `boolean` | Использовать MozJPEG для сжатия (для JPEG). |
| `chromaSubsampling` | `string` | Цветовая субдискретизация (например, `4:2:0`, `4:4:4`). |
| `compressionLevel` | `number` | Уровень сжатия zlib (0-9) для PNG. |
| `palette` | `boolean` | Использовать квантование цветов (палитру) для PNG. |
| `colors` | `number` | Максимальное количество цветов в палитре (2-256) для PNG. |
| `dither` | `number` | Уровень дизеринга (0-1.0) для PNG. |
| `adaptiveFiltering` | `boolean` | Использовать адаптивную фильтрацию строк для PNG. |

**Пример запроса (cURL):**
```bash
curl -X POST http://localhost:8080/api/v1/process \
  -F "file=@image.jpg" \
  -F 'params={"output":{"format":"webp","quality":85},"transform":{"resize":{"width":800}}}' \
  -o processed.webp
```

**Ответ:**
Бинарный поток данных обработанного изображения с соответствующим `Content-Type`.

---

### POST /api/v1/process/raw

Эндпоинт для обработки изображений, принимающий **raw stream** (тело запроса = бинарные данные изображения). Параметры обработки передаются в заголовке `x-img-params`.

**Ограничения:**

| Параметр | Значение |
| :--- | :--- |
| `Content-Type` | **Обязательно.** Должен быть `image/*` (например, `image/jpeg`). |
| `x-img-params` | **Опционально.** JSON строка с параметрами обработки (тот же формат, что и `params` в multipart). |
| Watermark | **Не поддерживается** в этом эндпоинте. |

**Пример запроса (cURL):**
```bash
curl -X POST http://localhost:8080/api/v1/process/raw \
  -H 'Content-Type: image/jpeg' \
  -H 'x-img-params: {"output":{"format":"webp","quality":85},"transform":{"resize":{"width":800}}}' \
  --data-binary '@image.jpg' \
  -o processed.webp
```

---

### POST /api/v1/exif

Извлечение метаданных EXIF. Принимает файл через `multipart/form-data`.

**Параметры запроса (multipart/form-data):**

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `file` | `File` | **Обязательно.** Файл изображения (binary). |
| `params` | `JSON string` | **Опционально.** Параметры (например, `priority`). |

**Ответ:**
```json
{
  "exif": {
    "Make": "Canon",
    "Model": "EOS 5D Mark IV",
    "DateTimeOriginal": "2024:01:15 14:30:00",
    "Orientation": 1
  }
}
```

**Пример запроса (cURL):**
```bash
curl -X POST http://localhost:8080/api/v1/exif \
  -F "file=@photo.jpg"
```

---


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
- `MAX_CONCURRENCY` - Количество параллельных задач обработки (default: 4)
- `QUEUE_TIMEOUT_SECONDS` - Таймаут ожидания задачи в очереди в секундах (default: 30)
- `REQUEST_TIMEOUT_SECONDS` - Таймаут выполнения запроса в секундах (default: 60)
- `SHUTDOWN_TIMEOUT_SECONDS` - Таймаут graceful shutdown в секундах (default: 30)

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
- Graceful shutdown с ожиданием завершения задач (30s)
- Мониторинг размера очереди и активных задач

### Очередь Задач

Сервис использует `p-queue` для управления параллельными задачами:
- **Приоритеты**: 0 (высокий), 1 (средний), 2 (низкий)
- **Таймаут на задачу**: 30 секунд (настраивается через `QUEUE_TIMEOUT_SECONDS`)
- **Таймаут запроса**: 60 секунд (настраивается через `REQUEST_TIMEOUT_SECONDS`)
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
- `MAX_CONCURRENCY=2`

#### Рекомендуемые Требования
- CPU: 4 ядра
- Memory: 4GB RAM
- `MAX_CONCURRENCY=4`

#### Высокая Нагрузка
- CPU: 8+ ядер
- Memory: 8GB+ RAM
- `MAX_CONCURRENCY=8`

### Оптимизация

**Общие рекомендации:**
- Устанавливайте `MAX_CONCURRENCY` равным количеству CPU ядер
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

**Q: Нужно ли указывать `mimeType` в запросе?**  
A: Нет, при использовании `multipart/form-data` MIME-тип файла определяется автоматически на основе заголовков загружаемой части (Content-Type части файла). Если вы используете водяной знак, его тип также определяется автоматически.

**Q: Сохраняется ли прозрачность при конвертации?**  
A: Да, прозрачность сохраняется при конвертации между форматами, которые её поддерживают (PNG, WebP, AVIF). Если вы конвертируете в формат без поддержки прозрачности (JPEG) или хотите явно удалить её, используйте параметр `flatten` для указания цвета фона.

**Q: Поддерживаются ли анимированные изображения?**  
A: Да, микросервис полностью поддерживает анимированные GIF как на входе, так и на выходе. Все кадры анимации обрабатываются корректно.

**Q: Какой максимальный размер изображения можно обработать?**  
A: По умолчанию максимальный размер файла - 25MB (настраивается через `FILE_MAX_BYTES_MB`). Сервис использует потоковую передачу, поэтому оперативную память занимают только буферы для текущих обрабатываемых задач.

### Трансформации

**Q: В каком порядке применяются трансформации?**  
A: Порядок применения трансформаций:
1. `autoOrient` - автоповорот на основе EXIF
2. `crop` - обрезка области
3. `resize` - изменение размера
4. `flip` / `flop` - отзеркаливание
5. `rotate` - явный поворот
6. `flatten` - удаление прозрачности и заливка фоном

**Q: Что делает параметр `autoOrient`?**  
A: `autoOrient` автоматически поворачивает и отзеркаливает изображение на основе EXIF тега Orientation. Это полезно для фотографий с камер и смартфонов. После применения тег Orientation сбрасывается.

**Q: Чем отличаются режимы `fit`?**  
A: 
- `cover` (по умолчанию) - заполняет указанные размеры, обрезая лишнее
- `inside` - вписывает изображение в указанные размеры, сохраняя пропорции
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
- Увеличьте `MAX_CONCURRENCY` (до количества CPU ядер)
- Для JPEG включите `mozjpeg=false` (быстрее, но хуже сжатие)

**Q: Почему обработка AVIF медленнее?**  
A: AVIF - новый формат с очень эффективным, но вычислительно сложным алгоритмом сжатия. Это нормально. Для ускорения уменьшите `effort` или используйте WebP.

**Q: Что делать при ошибке "413 Payload Too Large"?**  
A: Увеличьте `FILE_MAX_BYTES_MB` в конфигурации. Это автоматически увеличит лимит входящего запроса для Fastify.

### Мониторинг и Отладка

**Q: Как проверить статус сервиса?**  
A: Используйте эндпоинт `/api/v1/health`. Он возвращает статус сервиса, размер очереди и количество задач в обработке.

**Q: Где посмотреть логи?**  
A: Логи выводятся в stdout в JSON формате (Pino). В development режиме используется `pino-pretty` для читаемого вывода. В production логи структурированы для парсинга системами мониторинга.

**Q: Как работает graceful shutdown?**  
A: При получении сигнала SIGTERM/SIGINT сервис:
1. Прекращает принимать новые запросы
2. Ждёт завершения текущих задач в очереди (до `SHUTDOWN_TIMEOUT_SECONDS`)
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
  -F "file=@input.jpg" \
  -F 'params={"output":{"format":"webp","quality":85},"transform":{"resize":{"width":800}}}' \
  -o output.webp

# Извлечение EXIF метаданных
curl -X POST http://localhost:8080/api/v1/exif \
  -F "file=@photo.jpg"

# Наложение водяного знака (PNG логотип)
curl -X POST http://localhost:8080/api/v1/process \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'params={"transform":{"watermark":{"position":"southeast","opacity":0.8,"scale":15}},"output":{"format":"jpeg","quality":90}}' \
  -o watermarked.jpg

# Водяной знак в режиме tile (повторяющийся)
curl -X POST http://localhost:8080/api/v1/process \
  -F "file=@photo.jpg" \
  -F "watermark=@pattern.png" \
  -F 'params={"transform":{"watermark":{"mode":"tile","scale":8,"opacity":0.3,"spacing":50}},"output":{"format":"jpeg","quality":90}}' \
  -o tiled-watermark.jpg

# Health check
curl http://localhost:8080/api/v1/health
```

### Пример с fetch (Node.js)

```typescript
async function processImage() {
  const formData = new FormData();
  
  // Добавляем файл (в Node.js можно использовать fs.createReadStream или Blob)
  const fileResponse = await fetch('file://path/to/input.jpg');
  const blob = await fileResponse.blob();
  formData.append('file', blob, 'input.jpg');
  
  // Добавляем параметры обработки
  formData.append('params', JSON.stringify({
    output: { format: 'webp', quality: 85 },
    transform: { resize: { width: 800 } }
  }));

  const response = await fetch('http://localhost:8080/api/v1/process', {
    method: 'POST',
    body: formData // Fetch автоматически установит правильный Content-Type с boundary
  });

  if (response.ok) {
    const arrayBuffer = await response.arrayBuffer();
    // Использовать полученный результат...
  }
}
```

### Пример с Python

```python
import requests

def process_image(input_path, output_path):
    url = "http://localhost:8080/api/v1/process"
    
    # Файлы для multipart/form-data
    files = {
        'file': ('image.jpg', open(input_path, 'rb'), 'image/jpeg'),
    }
    
    # Параметры обработки
    data = {
        'params': '{"output": {"format": "webp", "quality": 85}}'
    }
    
    response = requests.post(url, files=files, data=data)
    
    if response.status_code == 200:
        with open(output_path, 'wb') as f:
            f.write(response.content)

if __name__ == '__main__':
    process_image('input.jpg', 'output.webp')
```

### Пример с TypeScript SDK

```typescript
class ImageProcessingClient {
  constructor(private baseUrl: string = 'http://localhost:8080/api/v1') {}

  async processImage(options: {
    file: Blob | Buffer;
    watermark?: Blob | Buffer;
    params?: any;
  }) {
    const formData = new FormData();
    
    if (options.file instanceof Buffer) {
      formData.append('file', new Blob([options.file]), 'image.jpg');
    } else {
      formData.append('file', options.file);
    }

    if (options.watermark) {
      if (options.watermark instanceof Buffer) {
        formData.append('watermark', new Blob([options.watermark]), 'watermark.png');
      } else {
        formData.append('watermark', options.watermark);
      }
    }

    if (options.params) {
      formData.append('params', JSON.stringify(options.params));
    }

    const response = await fetch(`${this.baseUrl}/process`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Processing failed: ${error.message}`);
    }

    const blob = await response.blob();
    return {
      blob,
      mimeType: response.headers.get('Content-Type'),
      filename: response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, ''),
    };
  }

  async extractExif(file: Blob | Buffer) {
    const formData = new FormData();
    if (file instanceof Buffer) {
      formData.append('file', new Blob([file]), 'image.jpg');
    } else {
      formData.append('file', file);
    }

    const response = await fetch(`${this.baseUrl}/exif`, {
      method: 'POST',
      body: formData,
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
const imageResponse = await fetch('https://example.com/photo.jpg');
const imageBlob = await imageResponse.blob();

const result = await client.processImage({
  file: imageBlob,
  params: {
    priority: 0,
    transform: {
      resize: { maxDimension: 2048 },
      autoOrient: true,
    },
    output: {
      format: 'avif',
      quality: 80,
      effort: 6,
    },
  },
});

// Сохранение в файл в браузере или Node.js
// const buffer = Buffer.from(await result.blob.arrayBuffer());
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

### ✅ v1.1 (Фаза 2) - Завершен
- [x] **Водяные знаки (watermarks)** - графические водяные знаки с режимами single и tile
- [x] **SVG как входной формат** - поддержка векторной графики
- [ ] Опциональная поддержка JPEG XL (требует кастомной сборки libvips)
- [ ] Умная обрезка (Smart Crop) с использованием entropy/attention
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
