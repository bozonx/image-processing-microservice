# Тестирование Водяных Знаков

## Быстрый Тест

### 1. Подготовка тестовых файлов

Вам понадобятся:
- Основное изображение (например, `test-image.jpg`)
- Файл водяного знака (например, `logo.png` или `watermark.svg`)

### 2. Тест одиночного водяного знака

```bash
curl -X POST http://localhost:8080/api/v1/process \
  -F "file=@test-image.jpg" \
  -F "watermark=@logo.png" \
  -F 'params={
    "transform": {
      "watermark": {
        "position": "southeast",
        "opacity": 0.8,
        "scale": 15
      }
    },
    "output": {
      "format": "jpeg",
      "quality": 90
    }
  }' \
  -o result-single.jpg
```

### 3. Тест режима tile

```bash
curl -X POST http://localhost:8080/api/v1/process \
  -F "file=@test-image.jpg" \
  -F "watermark=@logo.png" \
  -F 'params={
    "transform": {
      "watermark": {
        "mode": "tile",
        "scale": 8,
        "opacity": 0.3,
        "spacing": 50
      }
    },
    "output": {
      "format": "jpeg",
      "quality": 90
    }
  }' \
  -o result-tile.jpg
```

### 4. Тест с SVG водяным знаком

**Важно**: Убедитесь, что текст в SVG преобразован в кривые!

```bash
curl -X POST http://localhost:8080/api/v1/process \
  -F "file=@test-image.jpg" \
  -F "watermark=@copyright.svg" \
  -F 'params={
    "transform": {
      "watermark": {
        "position": "south",
        "scale": 20
      }
    },
    "output": {
      "format": "webp",
      "quality": 85
    }
  }' \
  -o result-svg.webp
```

### 5. Комбинация с другими трансформациями

```bash
curl -X POST http://localhost:8080/api/v1/process \
  -F "file=@test-image.jpg" \
  -F "watermark=@logo.png" \
  -F 'params={
    "transform": {
      "resize": {
        "maxDimension": 2048
      },
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
  -o result-combined.webp
```

## Проверка Результатов

После выполнения команд проверьте созданные файлы:
- `result-single.jpg` - должен содержать водяной знак в правом нижнем углу
- `result-tile.jpg` - должен содержать повторяющийся водяной знак по всей плоскости
- `result-svg.webp` - должен содержать SVG водяной знак внизу по центру
- `result-combined.webp` - должен быть уменьшен и содержать водяной знак

## Ожидаемое Поведение

### Успешные Случаи

1. **Одиночный водяной знак**: Водяной знак размещается в указанной позиции с заданной прозрачностью
2. **Режим tile**: Водяной знак повторяется по всей плоскости с заданным отступом
3. **SVG водяной знак**: SVG корректно масштабируется и накладывается
4. **Комбинация**: Все трансформации применяются в правильном порядке

### Ошибки

1. **Отсутствие файла водяного знака**:
   ```json
   {
     "statusCode": 400,
     "message": "Watermark file is required when watermark config is provided"
   }
   ```

2. **Невалидные параметры**:
   ```json
   {
     "statusCode": 400,
     "message": "Invalid params format"
   }
   ```

## Создание Тестового SVG

Если у вас нет SVG файла, создайте простой тестовый:

```bash
cat > copyright.svg << 'EOF'
<svg width="400" height="100" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="100" fill="none"/>
  <path d="M10,50 Q10,10 50,10 L350,10 Q390,10 390,50 Q390,90 350,90 L50,90 Q10,90 10,50 Z" 
        fill="rgba(0,0,0,0.5)"/>
  <text x="200" y="60" font-family="Arial" font-size="24" fill="white" 
        text-anchor="middle">© 2024 Company</text>
</svg>
EOF
```

**Важно**: Для production использования преобразуйте текст в кривые в графическом редакторе (Inkscape, Adobe Illustrator и т.д.).

## Производительность

Ожидаемое время обработки (для изображения 2000x2000px):

- **Режим single**: +50-100ms к базовому времени обработки
- **Режим tile (10x10 повторений)**: +100-200ms к базовому времени обработки
- **Режим tile (20x20 повторений)**: +200-300ms к базовому времени обработки

## Troubleshooting

### Проблема: Водяной знак не отображается

**Решение**: 
- Проверьте, что файл водяного знака загружен в поле `watermark`
- Убедитесь, что параметры `transform.watermark` указаны в `params`

### Проблема: SVG отображается некорректно

**Решение**:
- Преобразуйте текст в кривые (paths)
- Упростите SVG, удалив сложные эффекты
- Проверьте, что SVG валиден

### Проблема: Низкая производительность в режиме tile

**Решение**:
- Уменьшите `scale` (рекомендуется 5-10%)
- Увеличьте `spacing`
- Используйте меньший размер файла водяного знака
