FROM node:22-slim

WORKDIR /app

RUN npm install -g pnpm@10

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY shared ./shared
COPY orchestrator ./orchestrator
COPY providers ./providers
COPY deployments/fuji.json ./deployments/fuji.json

ENV NODE_ENV=production
ENV PORT=3010

EXPOSE 3010 3011 3012 3013 3014

CMD ["pnpm", "start:orchestrator"]
