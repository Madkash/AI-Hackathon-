# AI-Hackathon-

## ProofBid

Evidence-backed supplier RFP responses using local Nemotron 3 Nano 30B.

The [GB10 deployment source](proofbid-gb10/) includes React, FastAPI, MongoDB, and OpenClaw execution through a NemoClaw-managed OpenShell sandbox.

- [Setup and architecture](proofbid-gb10/GB10-README.md)
- [Validation status and remaining checks](proofbid-gb10/VALIDATION-STATUS.md)

This is untested GB10 deployment source, not production-validated software. Target installation, frontend build, live inference and sandbox isolation still require validation. Credentials and downloaded models are not included.

## LocalProof

LocalProof is an always-on, local-only software compliance readiness agent for the Dell Pro Max with GB10. OpenClaw plans work, NemoClaw supplies the local inference and deployment integration, and OpenShell enforces filesystem, process, and network boundaries.

The primary interface is headless. Start the local console target first:

```bash
cd compliance-console
npm ci
npm run dev -- --port 3000
```

Then plan and run the readiness checks from another terminal:

```bash
cd agent-runtime
npm ci
node bin/localproof.mjs plan --target ../examples/localproof-console-target.yaml --suite all
node bin/localproof.mjs run --target ../examples/localproof-console-target.yaml --suite all --output ../examples/results
```

Start with [COMPLIANCE_AGENT_WORKFLOW.md](./COMPLIANCE_AGENT_WORKFLOW.md), [RFP_EVIDENCE_FRAMEWORK.md](./RFP_EVIDENCE_FRAMEWORK.md), [agent-runtime/README.md](./agent-runtime/README.md), and [LOCAL_SOFTWARE.md](./LOCAL_SOFTWARE.md). The Next.js console in `compliance-console/` is an optional operator view.
