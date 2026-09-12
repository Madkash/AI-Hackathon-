"""Readiness diagnostics only. Does not run inference or prove isolation."""
import json
import argparse
import platform
import shutil
import subprocess
from pathlib import Path
from local_agent import ensure_local_model

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--inference', action='store_true', help='Run one real small AI request through the sandbox')
    args = parser.parse_args()
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
    from sandbox_transport import check_bridge, query
    bridge = check_bridge()
    if args.inference:
        schema = {'type': 'object', 'required': ['ok'], 'additionalProperties': False,
                  'properties': {'ok': {'const': True}}}
        query('This is a connectivity check. Return exactly {"ok":true}.', schema)
    print(json.dumps({'architecture': platform.machine(), 'model_metadata': 'local model found',
        'mongodb': 'reachable', 'openshell_cli': 'required flags found',
        'sandbox_bridge': bridge, 'live_inference_tested': args.inference, 'sandbox_isolation_tested': False}))

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        from local_agent import AgentUnavailable
        import sys
        # Never print database exceptions: their text may contain connection details.
        message = str(exc) if isinstance(exc, (AgentUnavailable, RuntimeError)) else type(exc).__name__ + ' during readiness checks'
        print('Readiness failed: ' + message, file=sys.stderr)
        sys.exit(1)
