# План Реализации Водяных Знаков

## Обзор

Добавление функциональности наложения графических водяных знаков (watermarks) на изображения.

**Поддерживаемые форматы водяных знаков:**
- PNG (рекомендуется для прозрачности)
- SVG (рекомендуется для векторной графики и текста)
- WebP (с поддержкой прозрачности)
- AVIF (с поддержкой прозрачности)
- Другие форматы с альфа-каналом

**Режимы наложения:**
1. **Single** - одиночный водяной знак в указанной позиции (по умолчанию)
2. **Tile** - повторяющийся водяной знак на всей плоскости изображения (режим cover)

## Технические Детали

### Использование Sharp API

Sharp предоставляет метод `.composite()` для наложения изображений:
- Поддержка множественных слоев
- Различные режимы наложения (blend modes)
- Точное позиционирование (координаты или gravity)
- Поддержка прозрачности
- Поддержка SVG как входного формата

### Режим Tile (Покрытие всей плоскости)

Для режима `tile` нужно:
1. Получить размеры основного изображения
2. Рассчитать количество повторений водяного знака по горизонтали и вертикали
3. Создать массив композитных слоев с рассчитанными позициями
4. Применить все слои через `.composite()`

## Решение Проблем

### Проблема 1: SVG с текстом

**Решение:**
- SVG полностью поддерживается Sharp
- **Важно**: текст в SVG должен быть преобразован в кривые (paths)
- Это необходимо, чтобы избежать проблем с отсутствующими шрифтами
- Добавить предупреждение в документацию

### Проблема 2: Как загрузить 2 файла в один запрос?

**Решение:**
Использовать multipart/form-data с несколькими файлами:
```
POST /api/v1/process
Content-Type: multipart/form-data

- file: основное изображение (обязательно)
- watermark: файл водяного знака (опционально, для графических водяных знаков)
- params: JSON с параметрами (включая настройки текстового водяного знака)
```

Fastify multipart поддерживает итерацию по всем файлам через `req.files()`.

## Структура API

### Расширение DTO

Добавить новый класс `WatermarkDto` в `process-image.dto.ts`:

```typescript
export class WatermarkDto {
  @IsOptional()
  @IsEnum(['northwest', 'north', 'northeast', 'west', 'center', 'east', 'southwest', 'south', 'southeast'])
  position?: string; // default: 'southeast', игнорируется в режиме tile

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  opacity?: number; // default: 1.0

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  scale?: number; // процент от размера основного изображения, default: 10

  @IsOptional()
  @IsEnum(['single', 'tile'])
  mode?: 'single' | 'tile'; // default: 'single'

  @IsOptional()
  @IsNumber()
  @Min(0)
  spacing?: number; // отступ между повторениями в режиме tile (в пикселях), default: 0
}
```

Добавить в `TransformDto`:
```typescript
@IsOptional()
@ValidateNested()
@Type(() => WatermarkDto)
public watermark?: WatermarkDto;
```

### Обновление Controller

Модифицировать `ImageProcessingController.process()`:
1. Использовать `req.files()` вместо `req.file()` для поддержки нескольких файлов
2. Извлечь основной файл (`file`) и опциональный файл водяного знака (`watermark`)
3. Валидировать: если в `params.transform.watermark` есть настройки, то файл `watermark` обязателен
4. Передать оба буфера в сервис

### Обновление Service

Добавить в `ImageProcessorService`:

```typescript
private async applyWatermark(
  pipeline: sharp.Sharp,
  watermarkBuffer: Buffer,
  watermarkConfig: WatermarkDto,
  metadata: sharp.Metadata
): Promise<void> {
  const { width = 0, height = 0 } = metadata;
  
  if (watermarkConfig.mode === 'tile') {
    // Режим tile: покрытие всей плоскости
    const composites = await this.createTiledWatermark(
      watermarkBuffer,
      watermarkConfig,
      width,
      height
    );
    await pipeline.composite(composites);
  } else {
    // Режим single: одиночный водяной знак
    const composite = await this.createSingleWatermark(
      watermarkBuffer,
      watermarkConfig,
      width,
      height
    );
    await pipeline.composite([composite]);
  }
}

private async createSingleWatermark(
  watermarkBuffer: Buffer,
  config: WatermarkDto,
  imageWidth: number,
  imageHeight: number
): Promise<sharp.OverlayOptions> {
  // Масштабирование водяного знака
  const scaledWatermark = await this.scaleWatermark(
    watermarkBuffer,
    config.scale ?? 10,
    imageWidth,
    imageHeight
  );
  
  return {
    input: scaledWatermark,
    gravity: (config.position ?? 'southeast') as any,
    blend: config.opacity !== undefined && config.opacity < 1 
      ? 'over' 
      : undefined
  };
}

private async createTiledWatermark(
  watermarkBuffer: Buffer,
  config: WatermarkDto,
  imageWidth: number,
  imageHeight: number
): Promise<sharp.OverlayOptions[]> {
  // Масштабирование водяного знака
  const scaledWatermark = await this.scaleWatermark(
    watermarkBuffer,
    config.scale ?? 10,
    imageWidth,
    imageHeight
  );
  
  // Получить размеры масштабированного водяного знака
  const wmMetadata = await sharp(scaledWatermark).metadata();
  const wmWidth = wmMetadata.width ?? 0;
  const wmHeight = wmMetadata.height ?? 0;
  const spacing = config.spacing ?? 0;
  
  // Рассчитать количество повторений
  const cols = Math.ceil(imageWidth / (wmWidth + spacing));
  const rows = Math.ceil(imageHeight / (wmHeight + spacing));
  
  // Создать массив композитов
  const composites: sharp.OverlayOptions[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      composites.push({
        input: scaledWatermark,
        top: row * (wmHeight + spacing),
        left: col * (wmWidth + spacing),
        blend: config.opacity !== undefined && config.opacity < 1 
          ? 'over' 
          : undefined
      });
    }
  }
  
  return composites;
}

private async scaleWatermark(
  watermarkBuffer: Buffer,
  scalePercent: number,
  imageWidth: number,
  imageHeight: number
): Promise<Buffer> {
  const targetSize = Math.min(imageWidth, imageHeight) * (scalePercent / 100);
  
  return sharp(watermarkBuffer)
    .resize({
      width: Math.round(targetSize),
      height: Math.round(targetSize),
      fit: 'inside',
      withoutEnlargement: true
    })
    .toBuffer();
}
```

## План Реализации

### Этап 1: Обновление DTO
- [ ] Создать `WatermarkDto` с поддержкой режимов `single` и `tile`
- [ ] Добавить `watermark` в `TransformDto`
- [ ] Добавить unit тесты для валидации DTO

### Этап 2: Обновление Controller
- [ ] Изменить `process()` для поддержки нескольких файлов через `req.files()`
- [ ] Добавить обработку файла водяного знака
- [ ] Добавить валидацию: если `transform.watermark` указан, файл `watermark` обязателен
- [ ] Обработать ошибки (отсутствие файла, неподдерживаемый формат)

### Этап 3: Реализация в Service
- [ ] Создать метод `applyWatermark()` в `ImageProcessorService`
- [ ] Реализовать `createSingleWatermark()` для режима single
- [ ] Реализовать `createTiledWatermark()` для режима tile
- [ ] Реализовать `scaleWatermark()` для масштабирования
- [ ] Интегрировать в метод `processStream()`
- [ ] Добавить обработку ошибок

### Этап 4: Тестирование
- [ ] Unit тесты для `applyWatermark()`
- [ ] Unit тесты для режима `single`
- [ ] Unit тесты для режима `tile`
- [ ] E2E тесты с PNG водяным знаком
- [ ] E2E тесты с SVG водяным знаком
- [ ] Тесты для edge cases (отсутствие файла, невалидные параметры)

### Этап 5: Документация
- [ ] Обновить README.md с примерами использования
- [ ] Добавить примеры cURL запросов для обоих режимов
- [ ] Добавить предупреждение о преобразовании текста в кривые для SVG
- [ ] Обновить Web UI для поддержки водяных знаков
- [ ] Обновить roadmap (переместить из v1.1 в completed)

## Примеры Использования

### Одиночный водяной знак (PNG логотип)

```bash
curl -X POST http://localhost:8080/api/v1/process \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'params={
    "transform": {
      "watermark": {
        "position": "southeast",
        "opacity": 0.8,
        "scale": 15
      }
    },
    "output": {"format": "jpeg", "quality": 90}
  }' \
  -o watermarked.jpg
```

### Одиночный водяной знак (SVG)

**Важно**: Текст в SVG должен быть преобразован в кривые (paths)!

```bash
curl -X POST http://localhost:8080/api/v1/process \
  -F "file=@photo.jpg" \
  -F "watermark=@copyright.svg" \
  -F 'params={
    "transform": {
      "watermark": {
        "position": "south",
        "scale": 20
      }
    },
    "output": {"format": "webp", "quality": 85}
  }' \
  -o watermarked.webp
```

### Режим Tile (покрытие всей плоскости)

```bash
curl -X POST http://localhost:8080/api/v1/process \
  -F "file=@photo.jpg" \
  -F "watermark=@watermark-pattern.png" \
  -F 'params={
    "transform": {
      "watermark": {
        "mode": "tile",
        "scale": 8,
        "opacity": 0.3,
        "spacing": 50
      }
    },
    "output": {"format": "jpeg", "quality": 90}
  }' \
  -o tiled-watermark.jpg
```

### Комбинация с другими трансформациями

```bash
curl -X POST http://localhost:8080/api/v1/process \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'params={
    "transform": {
      "resize": {"maxDimension": 2048},
      "autoOrient": true,
      "watermark": {
        "position": "southeast",
        "scale": 12,
        "opacity": 0.9
      }
    },
    "output": {
      "format": "webp",
      "quality": 85,
      "stripMetadata": true
    }
  }' \
  -o processed.webp
```

## Технические Ограничения

1. **Размер водяного знака**: Графический водяной знак автоматически масштабируется в зависимости от параметра `scale`
2. **Форматы**: Рекомендуется PNG или SVG для водяных знаков с прозрачностью
3. **SVG с текстом**: Текст должен быть преобразован в кривые (paths), иначе могут быть проблемы с отображением шрифтов
4. **Производительность**: 
   - Режим `single`: добавляет ~50-100ms к времени обработки
   - Режим `tile`: добавляет ~100-300ms в зависимости от количества повторений
5. **Режим tile**: При большом количестве повторений (>100) может значительно увеличиться время обработки

## Рекомендации

### Для SVG водяных знаков:
1. Преобразуйте весь текст в кривые (paths) в графическом редакторе
2. Оптимизируйте SVG (удалите лишние метаданные)
3. Используйте простые формы для лучшей производительности

### Для PNG водяных знаков:
1. Используйте PNG с прозрачностью (alpha channel)
2. Оптимизируйте размер файла перед использованием
3. Рекомендуемый размер: 200-500px для лучшей производительности

### Для режима Tile:
1. Используйте небольшие водяные знаки (scale: 5-10%)
2. Установите разумный spacing для избежания перегруженности
3. Используйте низкую opacity (0.2-0.4) для ненавязчивости

## Риски и Митигация

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| SVG с нераспознанными шрифтами | Средняя | Среднее | Документировать требование преобразования в кривые |
| Увеличение времени обработки в режиме tile | Высокая | Среднее | Ограничить max количество повторений, документировать SLA |
| Проблемы с прозрачностью в разных форматах | Низкая | Низкое | Тестировать с разными форматами, документировать поддержку |
| Сложность API с 2 файлами | Средняя | Среднее | Подробная документация, примеры в README |

## Оценка Времени

- Этап 1 (DTO): 1 час
- Этап 2 (Controller): 2 часа
- Этап 3 (Service): 4 часа
- Этап 4 (Тестирование): 4 часа
- Этап 5 (Документация): 2 часа

**Итого: ~13 часов (1.5 рабочих дня)**
