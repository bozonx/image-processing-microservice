# Development

## Requirements

Node.js from `.nvmrc` and pnpm from `package.json#packageManager`. `.npmrc` sets
`engine-strict=true`, so a wrong Node version fails at install time rather than at runtime.

Sharp ships prebuilt binaries for the common Linux, macOS and Windows targets. On anything else
it compiles from source, which is why `.npmrc` allows it to run install scripts.

## Getting started

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

The API is at `http://localhost:8080/api/v1`. In development the logs go through `pino-pretty`.
Set `ENABLE_UI=true` for the demo page at `/ui` — it is unauthenticated, so the service refuses
to start with it on while credentials are configured.

## Scripts

| Script                              | What it does                                                     |
| ----------------------------------- | ---------------------------------------------------------------- |
| `pnpm dev` / `pnpm dev:debug`       | Watch mode, with or without the inspector                        |
| `pnpm build` / `pnpm start`         | Compile to `dist/` / run the compiled app                        |
| `pnpm typecheck`                    | `tsc --noEmit` over `src/` **and** `test/`                       |
| `pnpm lint` / `pnpm lint:fix`       | Lint; `lint` never writes files and fails on warnings            |
| `pnpm format` / `pnpm format:check` | Prettier over the whole repository                               |
| `pnpm test:unit` / `pnpm test:e2e`  | One test project                                                 |
| `pnpm test:cov`                     | Both projects with coverage, enforcing the thresholds            |
| `pnpm check`                        | typecheck + lint + format check — static analysis only           |
| `pnpm validate`                     | `check` + unit tests — run this before considering a change done |
| `pnpm validate:all`                 | `check` + coverage + build — exactly what CI runs                |
| `pnpm check:fleet`                  | Reports drift in fleet-shared files against the boilerplate      |
| `pnpm docker:*`                     | Compose wrappers                                                 |

## Tests

Jest is split into two projects. Unit tests live in `test/unit/` and block outbound network
calls through nock; e2e tests live in `test/e2e/` and drive the real application.

Most e2e tests use `app.inject`, which never opens a socket. `test/e2e/real-socket.e2e-spec.ts`
deliberately does not: the endpoints once hung forever against a real HTTP client while the
injected suite stayed green, because the client-disconnect check misread a fully consumed
request body as a hang-up. Keep at least one test on a real socket for every body-carrying
endpoint.

Both `src/main.ts` and `test/e2e/test-app.factory.ts` build the app through `configureApp()`, so
there is one place where the application is assembled. Wiring applied in only one of the two
would pass the whole suite and still break in production.

Tests import `describe`, `it`, `expect` and friends from `@jest/globals`; injected globals are
off. That is what gives matchers real types. The application's own logs are silenced during
tests — run `LOG_LEVEL=debug pnpm test:e2e` to see them.

Jest needs `NODE_OPTIONS=--experimental-vm-modules` for ESM. It is set on the test scripts —
pnpm, unlike npm, does not apply `node-options` from `.npmrc` to script execution.

## Project layout

```
src/
  common/
    auth/        Basic and Bearer authentication hook
    filters/     global exception filter
    http/        API prefix helpers
    logger/      pino configuration factory
    utils/       validation-error formatting
  config/        app, auth and image configuration, plus service identity
  modules/
    health/      health endpoint and drain state
    image-processing/
      dto/       request parameter shapes
      services/  sharp pipeline, EXIF extraction, work queue
  configure-app.ts  wiring shared by main.ts and the e2e suite
test/
  unit/          unit tests
  e2e/           end-to-end tests
  setup/         per-project setup files
```

Imports between source files are relative and carry the `.js` extension, which is what Node's
ESM loader requires. TypeScript path aliases are deliberately not used.

## Working on the pipeline

Three limits bound image work and they are not interchangeable: `FILE_MAX_BYTES_MB` bounds the
compressed upload, `IMAGE_MAX_INPUT_PIXELS` bounds what it decodes to, and `IMAGE_MAX_DIMENSION`
bounds what comes back. A change to one is not a substitute for the others — a 2 MB PNG can
decode to tens of gigabytes, which is the case only the second limit catches.

Every request runs inside a `QueueService` slot, so concurrency stays bounded no matter how many
callers arrive at once. Work started outside that slot is work the queue cannot protect the
process from.

Configuration is validated at startup: an invalid value stops the process instead of surfacing
as an undefined halfway through a request.
