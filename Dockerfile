FROM oven/bun:latest as base
WORKDIR /app

COPY . .

ENV NODE_ENV=production
RUN apt-get update && apt-get install -y iputils-ping
RUN cd packages/database && bun install --frozen-lockfile
RUN bun install --frozen-lockfile

EXPOSE 8080
ENTRYPOINT ["bun", "run", "start"]

