# Changelog

## Unreleased

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
