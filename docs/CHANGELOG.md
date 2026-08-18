# Changelog

## Unreleased

- Fixed architectural design issues:
  - Moved multipart parsing in `/process` and `/exif` inside the concurrency-limited queue task, preventing memory exhaustion (10GB potential queue buffering vs 1GB container limit) and achieving memory parity with `/process/raw`.
  - Removed `await finished(res.raw)` and response delivery from inside queue concurrency tasks across all endpoints, ensuring slow network clients do not hold execution worker slots.
  - Extracted shared Fastify adapter creation and app bootstrap logic into `src/configure-app.ts` (`configureApp` and `createFastifyAdapter`), eliminating divergence between `src/main.ts` and `test/e2e/test-app.factory.ts` and ensuring UI static asset serving is active in e2e tests.
  - Consolidated duplicate `normalizeBasePath` implementations into `src/common/http/api-prefix.ts` (`normalizeBasePath`, `buildPrefixedPath`, `buildApiPrefix`, `buildUiPrefix`).
  - Streamlined Sharp processing in `ImageProcessorService` into a single pipeline pass without creating discarded intermediate pipelines or redundant re-encoding cycles.
  - Made `uiPrefix` optional in `AuthHookOptions` instead of passing artificial placeholder strings like `/__ui_disabled__`.

- Fixed error handling and validation for Sharp transformations:
  - Added strict DTO validation with `@IsIn` for resize positions and output chromaSubsampling, and color regex matching for `flatten`.
  - Mapped Sharp/libvips processing and input errors (corrupt data, out-of-bounds crop area, unsupported format/colors) to HTTP 400 (`BadRequestException`).
  - Mapped `p-queue`'s `TimeoutError` to HTTP 504 (`GatewayTimeoutException`) in `QueueService`, and updated `.env.example` descriptions for `QUEUE_TIMEOUT_SECONDS` (task execution duration) and `REQUEST_TIMEOUT_SECONDS` (total request timeout).
  - Ensured task `AbortSignal` is triggered upon queue/request timeouts in `QueueService` to immediately halt Sharp processing and release resources.
  - Refactored `ImageProcessingController` to perform response sending outside queue tasks, eliminating "Headers already sent" race conditions and silent returns on abort.
  - Updated e2e and unit tests to deterministically verify HTTP 400 responses for corrupt images and invalid transform parameters.
- Fixed 6 critical functional bugs:
  - Fixed watermark scaling to compute dimensions against post-transformation (resized/cropped/rotated) intermediate buffer rather than raw input dimensions, preventing overlay dimension mismatches and Sharp 500 errors.
  - Mitigated DoS vulnerability in tiled watermark mode by validating step sizes and limiting maximum tile overlays to 2,000, returning HTTP 400 when exceeded.
  - Clamped watermark scale dimensions to a minimum of 1px (`Math.max(1, ...)`) to prevent 0px dimension errors on small images.
  - Preserved `HttpException` status codes (e.g. `PayloadTooLargeException` 413) across multipart stream upload endpoints instead of masking them as `BadRequestException` 400.
  - Added native `.env` preloading in `src/config/env.ts` imported by `main.ts` and `service-info.ts` so `FILE_MAX_BYTES_MB`, `SERVICE_NAME`, and `SERVICE_VERSION` take effect properly before bootstrap.
- Optimized dependencies and test configuration: converted Jest configuration to native ESM `jest.config.js`, removed redundant `ts-node` and `tsconfig-paths` devDependencies, updated `p-queue` and `@jest/globals` to latest minor releases, and cleaned up tsconfig configurations.
- Updated `README.md` to fix heading hierarchy, add comprehensive API usage and parameter references, and remove trailing whitespace.
- Relocated validation errors helper to `src/common/utils/validation-errors.ts` to adhere strictly to the `src/` layout convention (`common/`, `config/`, `modules/`).
- Fixed static `public/` directory path resolution in `src/main.ts` so bundled UI assets are served properly in Docker containers.
- Fixed `main` and `start` script target paths in `package.json` to point to `dist/main.js`.
- Optimized Docker image build caching by moving `public/` asset copying out of the TypeScript compilation stage.
- Improved `docker-compose.yml` port mapping to respect `LISTEN_PORT`, marked `.env` file as optional, and eliminated redundant healthcheck definitions.

- Aligned validation scripts with strict isolation model: `check` for static analysis (typecheck, lint, formatting), `validate` for pre-commit (check + unit tests), and `validate:all` for full pre-release verification (validate + e2e + build); updated CI workflow to run unit tests explicitly.
- Hardened GitHub Actions workflows: added explicit least-privilege permissions and concurrency controls to security scans, integrated `docker/metadata-action` for OCI tags and labels in releases, passed context variables via step environment variables, and configured Dependabot for automated action and dependency updates.
- Modernized ESLint and TypeScript configurations: migrated to `typescript-eslint` v8 flat config helper, enabled `projectService` and `globals`, removed `eslint-plugin-prettier` in favor of separate formatting, enabled `noUncheckedIndexedAccess`, cleaned up JSON configs and removed redundant `.prettierrc`.
- Fixed the Docker runtime entry point to launch the Nest build output at `dist/main.js`.
- Upgraded `class-validator` to 0.15.1 after validating request DTOs with unit and e2e tests.
- Split CI validation from tag-only multi-architecture image releases and aligned the fleet-wide
  Renovate policy.
- Standardized fleet wiring: scripts, single `.env`, service identity, draining health checks,
  non-root multi-stage image, Compose resource limits, and Renovate configuration.
- Added `POST /api/v1/process/raw` endpoint that accepts raw image stream in request body and processing params in `x-img-params` header. Watermark is not supported for this endpoint.
- Fixed `process/raw` endpoint masking real errors as "This operation was aborted" (500). The `cleanup()` function was calling `abortController.abort()` unconditionally in `finally`, causing p-queue to reject with an abort error before the original error could propagate. Abort is now only called in `closeHandler` and `errorHandler` where it is actually needed.
