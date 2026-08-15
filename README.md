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

## Development

Use `pnpm check` for the same typecheck, lint, formatting and unit-test gate as CI. Run integration
tests with `pnpm test:e2e`. See [docs/dev.md](docs/dev.md) and [docs/deploy.md](docs/deploy.md).

## License

MIT
