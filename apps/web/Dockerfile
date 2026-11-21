FROM node:24.16.0-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,target=/app/.next/cache mkdir -p public/maplibre \
    && cp node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs public/maplibre/maplibre-gl-worker.mjs \
    && npm run build

FROM base AS runtime
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node healthcheck.mjs ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=4s --start-period=15s CMD ["node", "/app/healthcheck.mjs"]
CMD ["node", "server.js"]
