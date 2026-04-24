FROM node:20-alpine AS build

WORKDIR /app

COPY web/package*.json ./web/
WORKDIR /app/web
RUN npm install

COPY web/ ./
RUN npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
