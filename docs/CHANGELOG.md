# Changelog

## Unreleased

- Added `POST /api/v1/process/raw` endpoint that accepts raw image stream in request body and processing params in `x-img-params` header. Watermark is not supported for this endpoint.
- Fixed `process/raw` endpoint masking real errors as "This operation was aborted" (500). The `cleanup()` function was calling `abortController.abort()` unconditionally in `finally`, causing p-queue to reject with an abort error before the original error could propagate. Abort is now only called in `closeHandler` and `errorHandler` where it is actually needed.
