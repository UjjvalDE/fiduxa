# Fiduxa website (Next.js) image for the Hetzner test launch.
#   docker build -t fiduxa-web .
# Browser requests to /api/v1/* are routed to the API by Caddy, so the API
# base stays the relative default (/api/v1).
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT_STANDALONE=1
# Fallback proxy target inside the Docker network (Caddy normally routes /api first)
ENV API_PROXY_TARGET=http://api:3100
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN rm -rf server && npx next build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "server.js"]
