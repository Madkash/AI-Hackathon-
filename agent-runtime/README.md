# LocalProof Agent Runtime

This is the primary, headless interface for OpenClaw. The Next.js console is optional.

## Commands

```bash
node bin/localproof.mjs plan --target ../compliance-target.yaml --suite all
node bin/localproof.mjs run --target ../compliance-target.yaml --suite wcag --output ../results
```

`plan` resolves applicable tests without executing them. `run` executes implemented local checks and creates JSON evidence files.

## Runtime guarantees

- No remote API calls
- No remote model calls
- Localhost and private target hosts must be declared in the target YAML
- Active tests remain disabled unless `scope.active_testing` is `true`
- Intrusive tests are never executed by this scaffold
- Missing tools produce `not-run` results rather than attempted downloads

Install dependencies during device setup, before offline assessment:

```bash
npm ci
```
