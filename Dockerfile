FROM oven/bun:latest as base
WORKDIR /app

COPY . .

ENV NODE_ENV=production
RUN cd packages/database && bun install --frozen-lockfile
RUN bun install --frozen-lockfile

EXPOSE 80
ENTRYPOINT ["bun", "run", "start"]

