FROM oven/bun:latest
WORKDIR /app
COPY . .
EXPOSE 8080
RUN bun install
CMD ["bun", "start"]
