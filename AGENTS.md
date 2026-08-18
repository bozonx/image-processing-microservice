# Agent Rules (alwaysApply)

> The section "Common rules" below is identical in every service of this fleet. Do not edit it in a
> single repository — change it in `ivank-microservice-boilerplate` and roll it out everywhere.
> Service-specific rules go in the last section only.

## Common rules

- Microservice with a REST API.
- Node.js version: see `.nvmrc`. It must agree with `package.json#engines.node`.
- Package manager: `pnpm`, version pinned in `package.json#packageManager`.
- The fleet-wide standard for tooling, Docker, configuration and dependencies is
  `docs/standards.md` in `ivank-microservice-boilerplate`. Follow it; if a change conflicts with it,
  change the standard first.

### Layout

- Source: `src/`, with `common/`, `config/`, `modules/`.
- Unit tests: `test/unit/`, setup in `test/setup/unit.setup.ts`.
- E2E tests: `test/e2e/`, setup in `test/setup/e2e.setup.ts`.
- Guides: `docs/`. Development stage notes: `dev_docs/`.
- Docker: `docker/Dockerfile` and `docker/docker-compose.yml`.

### Practices

- Environment variables: `.env.example` is the source of truth. There is exactly one other env
  file, `.env`, and it is git-ignored and for local development only.
- Service name and version come from `src/config/service-info.ts`, never from importing
  `package.json` at runtime.
- Run `pnpm validate` before declaring work finished. CI runs `pnpm validate:all`; `pnpm check`
  on its own is static analysis only.
- Files shared across the fleet are changed in `ivank-microservice-boilerplate` and rolled out.
  `pnpm check:fleet` lists them and reports drift.
- Dependency ranges use caret (`^`). Never pin an exact version in the manifest.
- Update `docs/CHANGELOG.md` for significant changes.
- README, all documentation, JSDoc, log messages and user-facing strings are written in English.
- Do not leave transitional shims, deprecated aliases or compatibility fallbacks behind. When
  something is renamed or replaced, remove the old form in the same change.

## Service specifics

- Stack: TypeScript, NestJS, Fastify, Sharp, Pino, Docker.
- Entry point: `src/main.ts`. Wiring shared by the app and the e2e suite is in
  `src/configure-app.ts`; adding it only to `main.ts` would leave it untested.
- Stateless. A request carries the image in and the result comes back in the response body.
  There is no storage, no job id and no endpoint that hands out a result later. Proposals that
  need one — async processing, download links, retry-by-id — change this property and are a
  design decision, not an implementation detail.
- Consumers are other services, not end users, and the service runs behind a reverse proxy.
  Callers authenticate with a named Bearer token (`AUTH_BEARER_TOKENS=name:token`); health stays
  public for probes and everything else is closed by default.
- The bundled UI in `public/` is a development demo with no authentication of its own. It is off
  by default and the service refuses to start when it is enabled alongside authentication.
- Image work is bounded by three separate limits, and they are not interchangeable:
  `FILE_MAX_BYTES_MB` bounds the upload, `IMAGE_MAX_INPUT_PIXELS` bounds what it decodes to, and
  `IMAGE_MAX_DIMENSION` bounds what is returned.
