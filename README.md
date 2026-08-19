# Image Processing Microservice

A NestJS and Fastify service for image transformations with Sharp. It supports resize, crop,
rotation, watermarking, format conversion, EXIF extraction and queue limits.

The service is stateless and built for service-to-service calls behind a reverse proxy: a request
carries the image in and the result comes back in the same response. There is no storage and no
endpoint that hands out a result later.

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

The API is available at `http://localhost:8080/api/v1`. Setting `ENABLE_UI=true` also serves a
demo UI at `http://localhost:8080/ui` — see [Authentication](#authentication) for when that is
allowed.

Run the compiled service with `pnpm build && pnpm start`. Run the container with `pnpm docker:up`.

## API

| Method | Path                  | Description                                       |
| ------ | --------------------- | ------------------------------------------------- |
| `GET`  | `/api/v1/health`      | Public health, identity and queue status          |
| `POST` | `/api/v1/process`     | Process a multipart image and optional watermark  |
| `POST` | `/api/v1/process/raw` | Process an image supplied as the raw request body |
| `POST` | `/api/v1/exif`        | Extract image dimensions and EXIF metadata        |

### Endpoints and usage

- **`POST /api/v1/process`**
  - Accepts `multipart/form-data` with:
    - `file`: Source image file/stream (required).
    - `watermark`: Watermark image file/stream (optional, required if `transform.watermark` config is present).
    - `params`: JSON string with transformation options, output format, and queue priority.
- **`POST /api/v1/process/raw`**
  - Accepts raw image stream in the request body (`Content-Type: image/*` or `application/octet-stream`).
  - Processing parameters are passed as a JSON string via the `x-img-params` header. Watermark is not supported on this endpoint.
- **`POST /api/v1/exif`**
  - Accepts `multipart/form-data` with `file` and optional `params` JSON (priority). Returns `{ width, height, exif }`.

### Processing options

Parameters JSON supports:

- **`transform`**: `resize` (`width`, `height`, `maxDimension`, `fit`, `withoutEnlargement`, `position`), `crop` (`left`, `top`, `width`, `height`), `rotate` (-360 to 360), `autoOrient`, `flipHorizontal`, `flipVertical`, `flatten`, `watermark` (`position`, `opacity`, `scale`, `mode`, `spacing`).
- **`output`**: `format` (`webp`, `avif`, `jpeg`, `png`, `gif`, `tiff`, `raw`), `quality` (1-100), `lossless`, `effort`, `progressive`, `mozjpeg`, `stripMetadata`, etc.
- **`priority`**: Queue priority (`0` = high, `1` = normal, `2` = low).

Processed responses return dimensions and sizes in response headers: `X-Image-Width`, `X-Image-Height`, `X-Image-Size`, and `Content-Disposition`.

Set `BASE_PATH` to place all endpoints below a proxy prefix. For example, `BASE_PATH=images`
changes health to `/images/api/v1/health` and UI to `/images/ui`.

## Authentication

Callers are other services, so authentication is a shared secret per calling service rather than
a user login. Configure it with `AUTH_BEARER_TOKENS`, a comma-separated list of `name:token`
pairs:

```
AUTH_BEARER_TOKENS=svc-catalog:<token>,svc-uploader:<token>
```

Callers then send `Authorization: Bearer <token>`.

- The name is not a secret and does not authenticate anything. It identifies the caller in logs
  (`req.client`) and lets one service's token be revoked without rotating everyone else's. An
  entry without a name is rejected at startup.
- Tokens are compared as SHA-256 digests through `timingSafeEqual`, so neither a token's value
  nor its length leaks through response timing.
- Authentication is opt-in: with nothing configured the service is open, which is the intended
  setup for local development. Once anything is configured, `GET /api/v1/health` stays public for
  probes and **every other path requires a credential** — including paths that do not match a
  route, so a route added later is closed until someone opens it deliberately.
- `AUTH_BASIC_USER` / `AUTH_BASIC_PASS` exist because the fleet standard carries them, and both
  must be set together. This service has no browser-facing consumer, so leaving them unset is the
  expected configuration.

The service trusts `X-Forwarded-For` (`trustProxy`), so run it behind a proxy that sets the header
and does not accept it from the outside.

### The demo UI

`ENABLE_UI=true` serves the bundled page in `public/`. It is a development aid with no way to
present a Bearer token, so **enabling it alongside configured authentication is a startup error**
rather than a browsable, unauthenticated description of a closed API. It is off by default; use it
locally with authentication unset, and leave it off everywhere else.

## Configuration

`.env.example` is the complete configuration reference. The main settings are `LISTEN_HOST`,
`LISTEN_PORT`, `BASE_PATH`, `ENABLE_UI`, `MAX_CONCURRENCY`, the queue timeouts, the size limits
below, and `AUTH_BEARER_TOKENS`.

### Size limits

Three separate limits bound the work a single request can cause. They are not interchangeable:

| Variable                 | Bounds                                               | Default    |
| ------------------------ | ---------------------------------------------------- | ---------- |
| `FILE_MAX_BYTES_MB`      | The compressed upload, in MiB                        | `100`      |
| `IMAGE_MAX_INPUT_PIXELS` | Pixels a decoded input may expand to                 | `25000000` |
| `IMAGE_MAX_DIMENSION`    | Width and height of the returned image; `0` disables | `0`        |

`FILE_MAX_BYTES_MB` says nothing about memory: a 2 MB PNG can decode to tens of gigabytes.
`IMAGE_MAX_INPUT_PIXELS` is what stops that, and it is a memory budget — roughly 4 bytes per
pixel per concurrent task, so the default costs about 400 MiB at `MAX_CONCURRENCY=4`. Raise it
only alongside the container's memory limit.

`IMAGE_MAX_DIMENSION` is a ceiling on output, not a default size:

- A request asking to resize beyond it is rejected with `400`, not silently shrunk — the caller
  named an exact size and would otherwise discover the substitution downstream.
- An image with no resize of its own is scaled down to fit inside it, preserving aspect ratio.
- A result pushed past it by `fit: 'outside'`, an angled `rotate` or a large `crop` is rejected
  with `400`.
- `8192` is the most any configuration may allow; a larger value fails at startup.

### Quick commands

```bash
# Local development
pnpm dev # Start local development server in watch mode
pnpm validate # Run static analysis and unit tests
pnpm validate:all # Run full suite with coverage and build (CI parity)

# Docker container
pnpm docker:build # Build production container image
pnpm docker:up # Start container with Compose
pnpm docker:logs # Follow container logs
```

## License

MIT
