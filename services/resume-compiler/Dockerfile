FROM oven/bun:1.3.11-alpine

WORKDIR /app
COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/ios/package.json ./apps/ios/package.json
COPY packages/client/package.json ./packages/client/package.json
COPY services/resume-compiler/package.json ./services/resume-compiler/package.json
RUN bun install --frozen-lockfile --production

COPY services/resume-compiler/server.ts ./services/resume-compiler/server.ts
COPY packages/client/src/assets/fonts ./packages/client/src/assets/fonts

ENV PORT=8080
ENV RESUME_COMPILER_VERSION=typst-web-v2
EXPOSE 8080
CMD ["bun", "run", "services/resume-compiler/server.ts"]
