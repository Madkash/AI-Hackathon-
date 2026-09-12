FROM node:22-alpine
WORKDIR /workspace/agent-runtime
COPY agent-runtime/package.json agent-runtime/package-lock.json ./
RUN npm ci --omit=dev
COPY agent-runtime/ ./
COPY compliance-suites/ /workspace/compliance-suites/
CMD ["node", "bin/localproof.mjs"]

