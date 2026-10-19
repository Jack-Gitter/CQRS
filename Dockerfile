# Builds ONE of the two apps, selected with --build-arg APP=api|projector.
# docker-compose.yml builds this file twice, once per service.
FROM node:22-alpine AS build
ARG APP
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY nest-cli.json tsconfig.json ./
COPY apps ./apps
COPY libs ./libs
RUN npx nest build ${APP}

FROM node:22-alpine
ARG APP
ENV APP=${APP} NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist/apps/${APP} ./dist
CMD ["sh", "-c", "node dist/main.js"]
