FROM oven/bun:1.3.11-debian AS bun

FROM quay.io/sharelatex/texlive-full:2025.1

ARG TYPST_VERSION=0.14.0

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl fonts-liberation xz-utils \
  && curl -fsSL "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz" \
    | tar -xJ --strip-components=1 -C /usr/local/bin typst-x86_64-unknown-linux-musl/typst \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --production

COPY src ./src

ENV PORT=8080
EXPOSE 8080

CMD ["bun", "run", "start"]
