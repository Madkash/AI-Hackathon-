"""Safe error codes; never expose raw model output, credentials or stderr."""
import re

MESSAGES = {
    'sandbox_missing': 'Configured sandbox not found. Check PROOFBID_SANDBOX in .runtime.env.',
    'sandbox_not_ready': 'Sandbox is not ready. Check its NemoClaw status on the host.',
    'cli_incompatible': 'Installed CLI lacks a required command or option. Check OpenShell/OpenClaw versions.',
    'bridge_missing': 'Sandbox bridge missing. Rerun bash prepare-gb10.sh from the updated folder.',
    'config_missing': 'Scoped agent configuration missing. Rerun preparation for the configured sandbox.',
    'config_invalid': 'OpenClaw rejected the scoped configuration. Rerun preparation and inspect configuration validation.',
    'auth_failed': 'Inference authentication failed. Repair the NemoClaw local inference route.',
    'model_missing': 'Selected model is unavailable on the sandbox inference route.',
    'connection_failed': 'Agent cannot reach inference. Check Ollama and the NemoClaw route.',
    'timeout': 'AI request timed out. Check GPU memory and Ollama activity before retrying.',
    'command_missing': 'A required command is missing in the host or sandbox environment.',
    'agent_failed': 'OpenClaw failed. Run doctor.py --inference for a focused diagnostic.',
    'invalid_envelope': 'Unrecognized agent response envelope. Check the installed agent exec interface.',
    'invalid_json': 'Model did not return valid JSON. No result accepted; retry with a short sample.',
    'schema_failed': 'Model response did not match the required schema. No result accepted.',
    'response_too_large': 'Agent response exceeded the size limit.',
    'unexpected_model': 'Agent reported an unexpected provider or model. Response rejected.',
    'tool_invocation': 'Unexpected agent tool call. Response rejected.',
    'invalid_input': 'Sandbox request invalid or exceeds the input limit.',
    'permission_denied': 'Sandbox denied a required operation. Inspect its policy; do not disable isolation.',
}

class BridgeFailure(Exception):
    def __init__(self, code):
        self.code = code if code in MESSAGES else 'agent_failed'
        super().__init__(MESSAGES[self.code])

def describe(stage, code):
    return f'[{stage}/{code}] {MESSAGES.get(code, MESSAGES["agent_failed"])} No fallback used.'

def classify_stderr(stderr):
    # Emit a fixed code only: stderr itself can contain secrets or supplier text.
    rules = [
        ('cli_incompatible', r'unknown (?:command|option)|unrecognized arguments|unexpected argument|too many arguments'),
        ('sandbox_missing', r'sandbox.*(?:not found|does not exist)|no sandbox'),
        ('sandbox_not_ready', r'sandbox.*not ready|gateway.*(?:unavailable|not running)'),
        ('bridge_missing', r"can't open file.*agent_bridge|no such file.*agent_bridge"),
        ('config_missing', r'no such file.*agent\.json'),
        ('auth_failed', r'\b401\b|unauthorized|invalid api key|authentication failed'),
        ('permission_denied', r'permission denied|operation not permitted|policy denied'),
        ('config_invalid', r'invalid config|config.*(?:validation|unrecognized|invalid)|unknown provider'),
        ('model_missing', r'model.*(?:not found|not available|does not exist)'),
        ('timeout', r'timed out|timeout'),
        ('connection_failed', r'econnrefused|connection refused|fetch failed|unable to connect'),
        ('command_missing', r'command not found|no such file or directory'),
    ]
    return next((code for code, pattern in rules if re.search(pattern, stderr.lower())), 'agent_failed')
