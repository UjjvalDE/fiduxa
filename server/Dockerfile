# Fiduxa API / worker image. Build from the repo root:
#   docker build -t fiduxa-api ./server
# Run the API:    docker run --env-file server/.env -p 3100:3100 fiduxa-api
# Run the worker: docker run --env-file server/.env fiduxa-api node worker.js
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json main.js worker.js ./
COPY src ./src
# Run as the unprivileged "node" user that ships with the image
RUN chown -R node:node /app
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3100/ready >/dev/null || exit 1
CMD ["node", "main.js"]
