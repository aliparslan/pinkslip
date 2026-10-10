FROM oven/bun:1.3.11-alpine

WORKDIR /app
COPY package.json bun.lock ./
COPY services/resume-compiler/package.json ./services/resume-compiler/package.json
RUN bun install --frozen-lockfile --production

COPY services/resume-compiler/server.ts ./services/resume-compiler/server.ts
COPY services/resume-compiler/fonts ./services/resume-compiler/fonts

ENV PORT=8080
ENV RESUME_COMPILER_VERSION=typst-web-v2
EXPOSE 8080
CMD ["bun", "run", "services/resume-compiler/server.ts"]
