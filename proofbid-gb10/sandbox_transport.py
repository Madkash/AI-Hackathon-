"""Host-side stdin transport to an OpenClaw turn inside OpenShell."""
import json
import os
import re
import subprocess
import tempfile
from jsonschema import validate, ValidationError
from local_agent import AgentUnavailable

def query(prompt, schema):
    name = os.environ.get('PROOFBID_SANDBOX', 'cody')
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,62}', name):
        raise AgentUnavailable('Invalid sandbox name.')
    command = ['openshell', 'sandbox', 'exec', '-n', name, '--no-tty', '--timeout', '660', '--',
               'python3', '/sandbox/proofbid/agent_bridge.py']
    # Files are bounded by the service's quota and are deleted after the call.
    # Never forward MongoDB/app credentials or provider API keys to the sandbox.
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        try:
            run = subprocess.run(command, input=json.dumps({'prompt': prompt, 'schema': schema}).encode(),
                stdout=out, stderr=err, timeout=690, check=False)
            out.seek(0)
            raw = out.read(2_000_001)
            if run.returncode or len(raw) > 2_000_000:
                raise AgentUnavailable('Sandbox agent failed. Inspect the sandbox status and deployment diagnostics; no fallback was used.')
            result = json.loads(raw)
            validate(result, schema)
            return result
        except (OSError, subprocess.TimeoutExpired, ValueError, ValidationError) as exc:
            raise AgentUnavailable('Sandbox transport or schema validation failed; no result accepted.') from exc
