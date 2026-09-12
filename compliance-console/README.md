# LocalProof Compliance Console

Local Next.js operator interface for the software compliance readiness agent.

## Local development

From this directory:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The default discovery target is the example project in `../examples/nextjs-storefront`.

## Docker on the GB10

From this directory:

```bash
docker compose up --build
```

The Compose project runs the dashboard and MongoDB on an internal Docker network. The example targets are mounted read-only. OpenClaw runs separately inside the NemoClaw-managed OpenShell sandbox and invokes the same `discover-software` skill.

## Stack responsibilities

- Next.js: operator dashboard and local application routes
- OpenClaw: assessment planning and tool orchestration
- OpenShell: sandbox, filesystem boundaries, and network policy
- NemoClaw: managed OpenClaw/OpenShell setup and local inference routing
- MongoDB: targets, evidence, findings, and assessment state
- GB10 local model: extraction, reasoning, and report generation

The console makes no remote API or model calls.
