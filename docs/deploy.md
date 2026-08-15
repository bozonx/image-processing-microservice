# Deployment

Build the production image with `pnpm docker:build`. The multi-stage Dockerfile compiles from a
clean source tree and runs as the unprivileged `node` user. `APP_VERSION` is injected as
`SERVICE_VERSION` and appears in the health response.

Create `.env` from `.env.example`, then run `pnpm docker:up`. Compose enables init, graceful stop,
log rotation, a memory limit and a dependency-free health probe. In an orchestrator, supply
environment variables through its secret/configuration mechanism instead of copying `.env` into
the image.
