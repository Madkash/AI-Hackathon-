"""Host-to-sandbox transport with validated replies and actionable errors."""
import json
import os
import re
import subprocess
import tempfile
from jsonschema import validate, ValidationError
from local_agent import AgentUnavailable
from diagnostics import describe, classify_stderr, MESSAGES

def sandbox_command(check=False):
    name = os.environ.get('PROOFBID_SANDBOX', 'cody')
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,62}', name):
        raise AgentUnavailable('Invalid PROOFBID_SANDBOX. Use the exact existing sandbox name.')
    command = ['openshell', 'sandbox', 'exec', '-n', name, '--no-tty', '--timeout', '660', '--',
               'python3', '/sandbox/proofbid/agent_bridge.py']
    return command + (['--check'] if check else [])

def run_bridge(payload=None, check=False):
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        try:
            run = subprocess.run(sandbox_command(check), input=None if payload is None else json.dumps(payload).encode(),
                stdout=out, stderr=err, timeout=90 if check else 690, check=False)
        except subprocess.TimeoutExpired as exc:
            raise AgentUnavailable(describe('transport', 'timeout')) from exc
        except OSError as exc:
            raise AgentUnavailable(describe('transport', 'command_missing')) from exc
        out.seek(0)
        raw = out.read(2_000_001)
        if len(raw) > 2_000_000:
            raise AgentUnavailable(describe('transport', 'response_too_large'))
        try:
            reply = json.loads(raw)
        except ValueError:
            reply = None
        if isinstance(reply, dict) and reply.get('proofbid_protocol') == 1 and reply.get('error_code') in MESSAGES:
            raise AgentUnavailable(describe('agent', reply['error_code']))
        if run.returncode:
            err.seek(0)
            raise AgentUnavailable(describe('transport', classify_stderr(err.read(64000).decode('utf-8', errors='replace'))))
        if not isinstance(reply, dict):
            raise AgentUnavailable(describe('transport', 'invalid_envelope'))
        return reply

def check_bridge():
    reply = run_bridge(check=True)
    if reply.get('bridge_ready') is not True:
        raise AgentUnavailable(describe('transport', 'invalid_envelope'))
    return reply

def query(prompt, schema):
    reply = run_bridge({'prompt': prompt, 'schema': schema})
    if reply.get('proofbid_protocol') != 1 or 'result' not in reply:
        raise AgentUnavailable('Sandbox bridge is out of date. Rerun bash prepare-gb10.sh to upload matching bridge files.')
    try:
        validate(reply['result'], schema)
    except ValidationError as exc:
        raise AgentUnavailable(describe('model', 'schema_failed')) from exc
    return reply['result']
