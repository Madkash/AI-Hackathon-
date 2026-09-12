# Repair the generic AgentUnavailable failure

The screenshot confirms a failed job, not its underlying cause. This update repairs error reporting and checks the sandbox bridge before accepting the deployment as ready. It does not assert that a GB10 configuration or inference failure has been resolved without testing that machine.

## Apply to an existing installation

1. Stop the running app with Ctrl+C. Preserve any locally edited code before replacing files. Keep your existing .env, .runtime.env and LOGIN.txt; do not regenerate database credentials.
2. Overlay the supplied gb10 files onto the existing project folder, or merge the corresponding source changes. This update includes diagnostics.py and refresh-bridge.sh; copying only worker.py is insufficient.
3. In the GB10 HOST terminal, enter the existing project folder and run:

```bash
source .runtime.env
bash refresh-bridge.sh
.venv/bin/python doctor.py --inference
```

The refresh command updates the bridge in the sandbox named in .runtime.env and checks its CLI. The doctor command makes ONE real minimal model request through OpenShell and OpenClaw. It does not submit your documents or alter your model selection.

4. If this succeeds, run `bash start-gb10.sh`, reload the website, and submit a NEW sample analysis. An old failed job remains failed; it is not automatically retried.
5. If either diagnostic fails, share the diagnostic code and message, not credentials. Examples: `agent/cli_incompatible`, `transport/sandbox_missing`, `agent/auth_failed`, `model/schema_failed`. This identifies the next specific repair instead of the old generic AgentUnavailable label.

The active sandbox still needs to be configured for nemotron-3-nano:30b, and the host Ollama check must reach the actual local model on 127.0.0.1:11434. Do not disable sandbox policy, expose Ollama publicly, or switch to cloud inference to work around a diagnostic failure.

## Local regression checks

`python -m unittest -v test_bridge` exercises error propagation, CLI errors, model identity, tool rejection and schema validation with mocked processes. It is not a GB10 integration test.
