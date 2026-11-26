# Open TARA workbench as one image: one Node.js process serves the API and the built screens.
# The image holds no data. Everything a person enters is written to /data, which is a volume:
# the container can be thrown away and started again from the image, and nothing is lost.
#
#   docker build -t tara-workbench .
#   docker run --rm -p 127.0.0.1:8787:8787 -e TARA_ALLOWED_HOSTS=localhost,127.0.0.1 -v "$PWD/data:/data" tara-workbench
#
# or simply `docker compose up` (compose.yaml).

# ---- build the screens (needs the development dependencies)
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/store/package.json packages/store/
COPY packages/report/package.json packages/report/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY site/package.json site/
RUN npm ci
COPY packages packages
COPY apps apps
RUN npm run build

# ---- the tool itself: sources, the built screens, and only what is needed to run
FROM node:24-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    TARA_DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/store/package.json packages/store/
COPY packages/report/package.json packages/report/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY site/package.json site/
RUN npm ci --omit=dev && npm cache clean --force
COPY packages packages
COPY apps/server apps/server
COPY --from=build /app/apps/web/dist apps/web/dist
COPY methods methods
COPY examples examples
COPY LICENSE NOTICE THIRD_PARTY_LICENSES.md ./
# The tool runs as an ordinary user, and may write to the data folder only.
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "apps/server/src/main.ts"]
