FROM node:24-slim
WORKDIR /app
RUN npm install --global --ignore-scripts npm@12.1.0
COPY package*.json .npmrc ./
RUN npm ci --ignore-scripts
COPY . .
RUN mkdir -p proprietary && npm run build-prod
EXPOSE 3000 3001 3002
CMD ["node","--import","tsx","src/server/Server.ts"]
