FROM node:22-alpine AS dependencies
WORKDIR /workspace/compliance-console
COPY compliance-console/package.json compliance-console/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /workspace/compliance-console
COPY --from=dependencies /workspace/compliance-console/node_modules ./node_modules
COPY compliance-console/ ./
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /workspace/compliance-console
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /workspace/compliance-console/.next/standalone ./
COPY --from=builder /workspace/compliance-console/.next/static ./.next/static
COPY --from=builder /workspace/compliance-console/public ./public
COPY skills/discover-software /workspace/skills/discover-software
RUN mkdir -p /data/discovery /workspace/targets
EXPOSE 3000
CMD ["node", "server.js"]
