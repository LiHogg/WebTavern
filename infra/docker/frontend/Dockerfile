FROM node:20-bookworm-slim

WORKDIR /app/frontend

RUN apt-get update \
    && apt-get install -y --no-install-recommends wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g npm@10.9.2

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./

EXPOSE 3000

CMD ["npm", "run", "dev"]
