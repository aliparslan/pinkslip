FROM oven/bun:1.3.11-debian

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tectonic \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --production

COPY src ./src

ENV PORT=8080
EXPOSE 8080

CMD ["bun", "run", "start"]
