# Плана реализации: Рефакторинг параметров и переименование autoOrient

## 1. Переименование autoRotate в autoOrient
- [ ] **DTO**: В `src/modules/image-processing/dto/process-image.dto.ts` сделать `autoOrient` основным параметром, а `autoRotate` пометить как `@deprecated`.
- [ ] **Service**: В `src/modules/image-processing/services/image-processor.service.ts` обновить логику использования параметра.
- [ ] **Config**: В `src/config/image.config.ts` убедиться, что используется правильное имя.

## 2. Переименование IMAGE_MAX_BYTES_MB в FILE_MAX_BYTES_MB
- [ ] **Environment**: Заменить переменную в `.env.production.example` и `.env.development.example`.
- [ ] **Config**: Обновить `src/config/image.config.ts` для чтения новой переменной.
- [ ] **Documentation**: Обновить `README.md` и другие доки.

## 3. Оптимизация параметров окружения
- [ ] **Environment**: Удалить из `.env` файлов параметры, которые лучше оставить как внутренние дефолты:
    - `IMAGE_DEFAULT_STRIP_METADATA`
    - `IMAGE_DEFAULT_LOSSLESS`
    - `IMAGE_DEFAULT_EFFORT`
    - `IMAGE_DEFAULT_QUALITY`
    - `IMAGE_DEFAULT_FORMAT`
    - `IMAGE_JPEG_PROGRESSIVE`
    - `IMAGE_DEFAULT_AUTO_ORIENT`
- [ ] **Config**: Перенести эти значения в `image.config.ts` как жестко заданные дефолты.

## 4. Расширение поддержки Chroma Subsampling
- [ ] **Service**: Добавить поддержку `chromaSubsampling` для формата JPEG в `ImageProcessorService`.

## 5. Обновление документации и тестов
- [ ] **README.md**: Отразить изменения в API и параметрах конфигурации.
- [ ] **Tests**: Скорректировать тесты, если они используют старые имена параметров.
