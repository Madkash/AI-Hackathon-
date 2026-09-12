# LocalProof

LocalProof is an always-on, local-only software compliance readiness agent for the Dell Pro Max with GB10. OpenClaw plans work, NemoClaw supplies the local inference and deployment integration, and OpenShell enforces filesystem, process, and network boundaries.

The primary interface is headless:

```bash
cd agent-runtime
npm ci
node bin/localproof.mjs plan --target ../examples/localproof-console-target.yaml --suite all
node bin/localproof.mjs run --target ../examples/localproof-console-target.yaml --suite all --output ../examples/results
```

Start with [COMPLIANCE_AGENT_WORKFLOW.md](./COMPLIANCE_AGENT_WORKFLOW.md), [agent-runtime/README.md](./agent-runtime/README.md), and [LOCAL_SOFTWARE.md](./LOCAL_SOFTWARE.md). The Next.js console in `compliance-console/` is an optional operator view.
