# Image Processing Microservice

A NestJS and Fastify service for streaming image transformations with Sharp. It supports resize,
crop, rotation, watermarking, format conversion, EXIF extraction, queue limits and optional Basic
or Bearer authentication.

## Requirements

- Node.js 24 (see `.nvmrc`)
- pnpm 11.22.0
- Docker with Compose for containerized development

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

The API is available at `http://localhost:8080/api/v1`. When `ENABLE_UI=true`, the test UI is at
`http://localhost:8080/ui`.

Run the compiled service with `pnpm build && pnpm start`. Run the container with `pnpm docker:up`.

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Public health, identity and queue status |
| `POST` | `/api/v1/process` | Process a multipart image and optional watermark |
| `POST` | `/api/v1/process/raw` | Process an image supplied as the raw request body |
| `POST` | `/api/v1/exif` | Extract image dimensions and EXIF metadata |

Set `BASE_PATH` to place all endpoints below a proxy prefix. For example, `BASE_PATH=images`
changes health to `/images/api/v1/health`.

## Configuration

`.env.example` is the complete configuration reference. The main settings are `LISTEN_HOST`,
`LISTEN_PORT`, `BASE_PATH`, `ENABLE_UI`, `FILE_MAX_BYTES_MB`, `MAX_CONCURRENCY`, queue timeouts and
optional `AUTH_BASIC_*` or `AUTH_BEARER_TOKENS` credentials. Health always remains public.

# Deployment

Build the production image with `pnpm docker:build`. The multi-stage Dockerfile compiles from a
clean source tree and runs as the unprivileged `node` user. `APP_VERSION` is injected as
`SERVICE_VERSION` and appears in the health response.

Create `.env` from `.env.example`, then run `pnpm docker:up`. Compose enables init, graceful stop,
log rotation, a memory limit and a dependency-free health probe. In an orchestrator, supply
environment variables through its secret/configuration mechanism instead of copying `.env` into
the image.

# Development

Use Node.js from `.nvmrc`, enable Corepack, then run `pnpm install`. Copy `.env.example` to `.env`
and start watch mode with `pnpm dev`. The committed example is the source of truth; do not create
environment-specific dotenv files.

Before submitting changes, run `pnpm check` and `pnpm test:e2e`. Use `pnpm format` and
`pnpm lint:fix` for automatic fixes. Image processing is CPU- and memory-intensive, so test large
inputs and queue saturation when changing Sharp pipelines or limits.


## License

MIT
