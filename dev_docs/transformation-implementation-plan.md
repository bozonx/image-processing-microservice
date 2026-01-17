# Плана реализации трансформаций изображений

Добавление поддержки `rotate`, `flip`, `flop`, `crop` и `autoRotate` в микросервис обработки изображений.

## 1. Обновление DTO (`src/modules/image-processing/dto/process-image.dto.ts`)

- Добавить `ExtractDto` (для `crop`) с полями `left`, `top`, `width`, `height`.
- Обновить `TransformDto`:
    - Добавить `rotate?: number` (угол поворота).
    - Добавить `flip?: boolean` (вертикальное отражение).
    - Добавить `flop?: boolean` (горизонтальное отражение).
    - Добавить `crop?: ExtractDto` (обрезка).
    - Переименовать `autoOrient` в `autoRotate` (или добавить `autoRotate` как алиас).
- Убедиться, что `ResizeDto` уже содержит `fit`.

## 2. Обновление сервиса (`src/modules/image-processing/services/image-processor.service.ts`)

- Внедрим логику обработки новых параметров в пайплайн `sharp`.
- Порядок вызовов в `sharp` важен для предсказуемости, хотя `sharp` сам оптимизирует очередь. Мы будем следовать логике:
    1. `autoRotate()` (EXIF).
    2. `extract()` (crop) - если нужно обрезать ДО ресайза.
    3. `resize()` (включая `fit`).
    4. `flip()` / `flop()`.
    5. `rotate(angle)`.
- **Вопрос про EXIF**: Мы будем применять `autoRotate()` первым. Это гарантирует, что пользовательские `rotate` и `flip` применяются к визуально корректному изображению. Если пользователь хочет игнорировать EXIF, он может передать `autoRotate: false`.

## 3. Обновление тестов (`test/unit/image-processor.service.spec.ts`)

- Добавить тесты на новые трансформации.

## 4. Обновление документации (`README.md` и `dev_docs/`)

- Описать новые параметры API.
