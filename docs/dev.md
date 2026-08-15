# Development

Use Node.js from `.nvmrc`, enable Corepack, then run `pnpm install`. Copy `.env.example` to `.env`
and start watch mode with `pnpm dev`. The committed example is the source of truth; do not create
environment-specific dotenv files.

Before submitting changes, run `pnpm check` and `pnpm test:e2e`. Use `pnpm format` and
`pnpm lint:fix` for automatic fixes. Image processing is CPU- and memory-intensive, so test large
inputs and queue saturation when changing Sharp pipelines or limits.
