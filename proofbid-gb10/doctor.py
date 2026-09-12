"""Readiness diagnostics only. Does not run inference or prove isolation."""
import json
import platform
import shutil
import subprocess
from pathlib import Path
from local_agent import ensure_local_model

def main():
    if platform.system() != 'Linux' or platform.machine() != 'aarch64':
        raise RuntimeError('Expected Linux ARM64 GB10')
    for executable in ('docker', 'openshell', 'nemoclaw', 'nvidia-smi'):
        if not shutil.which(executable):
            raise RuntimeError('Missing command: ' + executable)
    ensure_local_model('nemotron-3-nano:30b')
    help_text = subprocess.check_output(['openshell', 'sandbox', 'exec', '--help'], text=True)
    for flag in ('--name', '--timeout', '--no-tty'):
        if flag not in help_text:
            raise RuntimeError('Installed OpenShell lacks ' + flag)
    from store import initialize
    initialize()
    print(json.dumps({'architecture': platform.machine(), 'model_metadata': 'local model found',
        'mongodb': 'reachable', 'openshell_cli': 'required flags found',
        'live_inference_tested': False, 'sandbox_isolation_tested': False}))

if __name__ == '__main__':
    main()
