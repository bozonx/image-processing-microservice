ARG NODE_MAJOR=22
FROM node:${NODE_MAJOR}-bookworm-slim

# Install system dependencies for Sharp
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips-dev \
    python3 \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV LISTEN_HOST=0.0.0.0
ENV LISTEN_PORT=3000
ENV TZ=UTC
ENV LOG_LEVEL=info

# Install pnpm
RUN corepack enable

# Copy runtime files
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --prefer-offline || pnpm install --prod --prefer-offline

# Copy pre-built application
COPY dist ./dist

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g 1001 -m -s /usr/sbin/nologin nodejs

USER nodejs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/src/main.js"]
