# Base image
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# -------------------------
# Install dependencies
# -------------------------
FROM base AS install

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# -------------------------
# Production dependencies
# -------------------------
FROM base AS prod-install

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# -------------------------
# Build / prerelease
# -------------------------
FROM base AS prerelease

COPY --from=install /usr/src/app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production

# Optional:
# RUN bun test
# RUN bun run build

# -------------------------
# Final runtime image
# -------------------------
FROM oven/bun:1 AS release

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Production deps only
COPY --from=prod-install /usr/src/app/node_modules ./node_modules

# Copy app files
COPY --from=prerelease /usr/src/app ./

USER bun

EXPOSE 3000

ENTRYPOINT ["bun", "run", "index.ts"]