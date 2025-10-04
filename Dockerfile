# syntax=docker/dockerfile:1

FROM node:20-alpine AS base

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production \
    ROUTER_HTTP_PORT=3000

EXPOSE 3000

CMD ["node", "lib/server/http.js"]
