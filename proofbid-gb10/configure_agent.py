"""Run inside sandbox after onboarding; derive a tool-free, one-provider config."""
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse

path = subprocess.check_output(['openclaw', 'config', 'file'], text=True).strip()
# Refuse non-JSON configs; do not improvise parsing or expose credentials in errors.
live = json.loads(Path(os.path.expanduser(path)).read_text())
primary = live['agents']['defaults']['model']
primary = primary['primary'] if isinstance(primary, dict) else primary
provider, model = primary.split('/', 1)
if model != 'nemotron-3-nano:30b':
    raise SystemExit('Onboarding selected a different model. Select local nemotron-3-nano:30b, then rerun.')
entry = live['models']['providers'][provider]
endpoint = urlparse(entry['baseUrl'])
if endpoint.hostname not in ('inference.local', 'host.openshell.internal'):
    raise SystemExit('Unknown inference route. Review the installed NemoClaw route before proceeding.')
if endpoint.scheme not in ('http', 'https'):
    raise SystemExit('Invalid endpoint scheme')
config = {
    'models': {'mode': 'replace', 'providers': {provider: entry}},
    'agents': {'defaults': {'model': {'primary': primary, 'fallbacks': []}, 'memorySearch': {'enabled': False}}},
    'tools': {'deny': ['*']}, 'browser': {'enabled': False},
    'plugins': {'slots': {'memory': 'none'}},
}
# Keep provider credentials local to sandbox, with owner-only permissions.
target = Path('/sandbox/proofbid/agent.json')
target.parent.mkdir(parents=True, exist_ok=True)
fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as stream:
    json.dump(config, stream)
os.chmod(target, 0o600)
print('Created scoped agent configuration. No credentials printed.')
