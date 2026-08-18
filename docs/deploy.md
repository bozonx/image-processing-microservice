# Deployment

## Image

`docker/Dockerfile` builds the project itself in three stages — `deps`, `build`, `runtime` — so
the image is reproducible from a clean clone. No target needs a pre-built `dist/`.

Notable properties:

- The `deps` stage installs `python3` and `build-essential` because sharp falls back to building
  its native bindings when no prebuilt binary matches the platform.
- The runtime stage runs as the unprivileged `node` user that ships with the official image.
  Compose therefore needs no `user:` key.
- `HEALTHCHECK` uses `node -e`, which depends on no extra packages and survives a change of base
  image. It honours `BASE_PATH`.
- PID 1 signal handling comes from `init: true` in compose, so the image carries no `tini`.
- `.dockerignore` is a whitelist. Everything is denied and the build context is opened only for
  the files the build needs; a blacklist eventually misses a new secret file.

## Building

```bash
docker build -f docker/Dockerfile \
  --build-arg NODE_MAJOR=$(cat .nvmrc) \
  --build-arg APP_VERSION=$(node -p "require('./package.json').version") \
  -t ghcr.io/bozonx/image-processing-microservice:latest .
```

`APP_VERSION` becomes `SERVICE_VERSION`, which appears in the logs and in the health response.
A release is cut by pushing a `v*` tag whose version matches `package.json`; the workflow
refuses to publish when the two disagree.

## Running

```bash
pnpm docker:up
```

Compose sets `restart`, `init: true`, `stop_grace_period`, log rotation, a memory limit and a
health check matching the one in the image. `env_file` points at `../.env` and is optional: in
an orchestrator the environment comes from the platform and no file is read.

## Sizing

The container is limited to 1 GiB. Budget roughly four bytes per pixel per concurrent task:
`IMAGE_MAX_INPUT_PIXELS` of 25M with `MAX_CONCURRENCY` of 4 needs about 400 MiB of headroom.
Raising either without raising the limit kills every in-flight request, not just the one that
caused it.

## Shutdown

On SIGTERM the service reports `503 shutting_down` from health while it keeps serving for
`SHUTDOWN_DRAIN_SECONDS`, so the load balancer can drain it before any request is refused. Only
then does it close, letting the queue finish its in-flight work.

The process always exits with an explicit status: `0` after a clean close, `1` when the close
fails, and `1` after `SHUTDOWN_FORCE_EXIT_SECONDS` if it never finishes. Keep the two windows
together below `stop_grace_period`, otherwise the orchestrator's SIGKILL arrives first and
reports a hang as a clean stop.

## Behind a proxy

The service expects to run behind a reverse proxy and trusts the forwarding headers, so logs
record the calling host rather than the proxy. Set `BASE_PATH` when the proxy routes by path
without stripping the prefix; every route, the health probe and the demo UI honour it.

Callers authenticate with a named Bearer token (`AUTH_BEARER_TOKENS=name:token`). Health stays
public for probes; everything else is closed by default.
