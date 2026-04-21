FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 7880
EXPOSE 10000-10100/udp

CMD ["npm", "start"]
