# Changelog

## [2.0.0] - 2026-08-18

### Changed

- **Breaking (scripts).** `check` is static analysis only (`typecheck && lint && format:check`),
  `validate` adds unit tests, and `validate:all` adds a coverage run of both projects and a
  build. CI now runs `pnpm validate:all` as a single step, so there is nothing CI does that a
  developer has no command for. The split is now the fleet standard, not a local deviation.
- `typecheck` runs over `tsconfig.spec.json`, so `test/` is type-checked. It never was, and it
  was hiding two real type errors in the suite — a `Buffer` passed where a `BlobPart` was
  expected, and an assertion on a mock that takes no arguments.
- `lint` fails on warnings, and `format:check` covers the whole repository rather than
  `{src,test}/**/*.ts`. Thirteen accumulated lint warnings and several unformatted files had
  been invisible to CI.
- **`ImageProcessingController` rewritten around three helpers.** The client-disconnect dance
  (`AbortController`, the `complete`/`destroyed` test, listener teardown) was written out three
  times, the header-parameter parser twice, the multipart loop twice and the response-header
  block twice. They are now `runQueued`, `collectMultipart`, `parseParams` and `sendImage`, and
  the file is a third shorter. Behaviour is unchanged except that a reply `error` event now
  counts as a disconnect on every endpoint, not only on `process/raw`.
- Aborts travel as a typed `RequestAbortedError` instead of being recognised by comparing error
  message strings at six different call sites.
- Shutdown always ends in an explicit exit status: `0` after a clean close, `1` when the close
  throws, and `1` after the new `SHUTDOWN_FORCE_EXIT_SECONDS` when it never returns. A queue
  task that never settles used to leave the process hanging until the orchestrator's SIGKILL,
  which is reported as a clean stop. The adapter also sets `forceCloseConnections: true`.
- The body limit has one source of truth. `createFastifyAdapter` re-read `FILE_MAX_BYTES_MB`
  from the environment with its own default, so the adapter and `image.config.ts` could disagree
  about how large a body may be.
- The health response is typed again (`HealthResponse`), and its extra `queue` field is now
  recorded as an allowed deviation in the fleet standard rather than being undocumented.
- Configuration is built through the shared `validateConfig()` helper and reports the failing
  property path. `plainToClass` was replaced with `plainToInstance` — the former is deprecated.
- ESLint gained `no-deprecated`, `no-unnecessary-condition` and `eqeqeq`, which found five dead
  conditions across the pipeline and the queue.
- Jest runs with `injectGlobals: false` and a coverage threshold; tests import from
  `@jest/globals`, which is what gives matchers their types. Application logs are silenced
  during tests.
- The log line for health requests is skipped on an exact path match. `url.includes('/health')`
  also silenced any other route with `health` anywhere in it.
- Logs carry `version` again, and `cookie` is redacted alongside `authorization`.

### Added

- `docker/docker-compose.yml` has the `healthcheck` the standard requires and the README already
  claimed it had.
- `docs/dev.md` and `docs/deploy.md`, both required by the standard and both missing.
- `pnpm check:fleet` (`scripts/check-fleet.mjs`), reporting drift in the files that are meant to
  be byte-identical across the fleet. The API-prefix helper, the exception filter and `main.ts`
  had each drifted from the boilerplate with nothing to catch it.
- `SHUTDOWN_FORCE_EXIT_SECONDS` in `.env.example`.

### Removed

- Dead code: the `Buffer.isBuffer` branch on a parameter typed as a stream, a `catch` clause
  whose two arms rethrew the same value, `?? 0` fallbacks on sharp metadata fields that are not
  optional, and the lint-only `tsconfig.eslint.json`, which had no effect since the move to
  `projectService`.
- The `haste` block and `injectGlobals` from the Jest configuration.

- Fixed every body-carrying endpoint hanging forever against a real HTTP client. The client
  disconnect check treated `req.raw.destroyed` as a hang-up, but Node marks an `IncomingMessage`
  destroyed as soon as its body has been fully consumed — which is what a healthy request does.
  Each request aborted itself the instant its upload finished, processed the image anyway, and
  then never sent the response. `complete` is now the test, since false there means the body
  really did stop arriving early. The injected e2e suite could not see this, so the endpoints are
  now also covered over a real socket in `test/e2e/real-socket.e2e-spec.ts`.
- **Breaking (configuration).** `AUTH_BEARER_TOKENS` entries are now `name:token` pairs. The name
  identifies the calling service in logs (`req.client`) and lets one caller be revoked without
  rotating everyone else's token; a bare token is rejected at startup.
- **Breaking (configuration).** `ENABLE_UI=true` combined with configured authentication is now a
  startup error, and `ENABLE_UI` defaults to off. The bundled UI cannot present a Bearer token, so
  serving it alongside a closed API meant publishing an unauthenticated description of that API.
- Replaced the local fork of the auth hook with the fleet implementation from
  `ivank-microservice-boilerplate`. The fork had drifted into three defects the shared version
  never had: an unauthenticated bypass for a `/api/v1/download/` endpoint this service does not
  have, allow-by-default handling that left every path outside `/api/v1` and `/ui` open, and a UI
  carve-out that served the demo page unauthenticated whenever only Bearer tokens were configured.
  Authorisation is now deny-by-default: health is public, everything else requires a credential.
- Added `IMAGE_MAX_INPUT_PIXELS` (default 25M), passed to sharp's `limitInputPixels`. `FILE_MAX_BYTES_MB`
  bounds the compressed upload only, so a small, highly compressed file could previously decode past
  the container's memory limit and take down every in-flight request with it.
- Replaced the unused `defaults.maxDimension` with `IMAGE_MAX_DIMENSION`, a real ceiling on returned
  width and height: oversized resize requests are rejected, an image with no resize of its own is
  scaled to fit, and a result pushed past the ceiling by `fit: 'outside'`, `rotate` or `crop` is
  rejected. The ceiling is never appended to a request that resizes itself — sharp keeps only the
  last `resize()` call, so doing that would silently discard what the caller asked for.
- Enabled `trustProxy`, so logs record the calling host rather than the reverse proxy.
- Logged the authenticated caller as `req.client`.
- Documented the service's stateless, service-to-service design in `AGENTS.md`, and rewrote the
  README's authentication and size-limit sections around it.

- Fixed security, validation, UI routing, and lifecycle issues:
  - Hardened secret comparison in `auth.hook.ts` using `crypto.timingSafeEqual` with SHA-256 fixed-length digests to prevent timing side-channel attacks on Basic credentials and Bearer tokens.
  - Normalized trailing slashes when matching request paths against `publicPaths`, preventing `/api/v1/health/` from returning 401 Unauthorized.
  - Enforced `{ whitelist: true, forbidNonWhitelisted: true }` on manual validation calls across `ImageProcessingController`, rejecting unknown/misspelled properties with HTTP 400.
  - Prevented double-wrapped `BadRequestException` validation messages in multipart params handlers.
  - Fixed `API_BASE` regex in `public/app.js` to correctly resolve API prefix when accessing `/ui/index.html` directly.
  - Added global `unhandledRejection` / `uncaughtException` process handlers and `.catch()` on `bootstrap()`.
  - Hardened graceful shutdown error handling and safe process exit in `main.ts`.
  - Added NaN protection for `FILE_MAX_BYTES_MB` parsing in `createFastifyAdapter`.
  - Removed no-op `constraints: {}` and switched `join(__filename, '..')` to `dirname(__filename)` in `configure-app.ts`.
  - Cleaned up dead `Readable` stream code and duplicate `maxBytes` checks from `ExifService`.
  - Updated `QueueService` capacity calculation to include both queued and pending active tasks (`queue.size + queue.pending >= maxQueueSize`).
  - Pruned redundant HTTP 3xx log level check in `logger.factory.ts`.
  - Passed GIF encoding options (`effort` clamped to 1..10, `colors`, `dither`, `progressive`) to `Sharp.gif()` in `ImageProcessorService`.

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
