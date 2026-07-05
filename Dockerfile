FROM node:20-alpine AS build
WORKDIR /src
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
# Builds with a `/__BASE__/` placeholder base (see vite.config.ts). The
# runtime entrypoint rewrites it to the real BASE_PATH, so ONE image
# works mounted at any URL path.
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
USER root
# Stage the built SPA under /app; the entrypoint copies it into the html
# root under BASE_PATH and rewrites the placeholder at container start.
COPY --from=build /src/dist /app
COPY docker-entrypoint.d/40-chino-base.sh /docker-entrypoint.d/40-chino-base.sh
RUN chmod +x /docker-entrypoint.d/40-chino-base.sh \
  && chown -R 101:0 /usr/share/nginx/html /etc/nginx/conf.d /app \
  && chmod -R g+w /usr/share/nginx/html /etc/nginx/conf.d
USER 101
ENV BASE_PATH=/
EXPOSE 8080
LABEL org.opencontainers.image.source="https://github.com/zaentrum/chino-web"
LABEL org.opencontainers.image.title="chino-web"
