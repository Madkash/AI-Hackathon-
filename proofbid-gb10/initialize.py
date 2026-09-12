"""Create local secrets once. Never overwrite existing credentials."""
import os
from pathlib import Path
import secrets
import shlex

root = Path(__file__).resolve().parent
env_path = root/'.env'
runtime_path = root/'.runtime.env'
if env_path.exists() or runtime_path.exists():
    raise SystemExit('Environment already initialized (or partially initialized). Preserve existing credentials; inspect files manually.')
password = secrets.token_hex(32)
db_password = secrets.token_hex(32)
def write_private(path, text):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(text)
write_private(env_path, 'MONGO_ROOT_PASSWORD=' + secrets.token_hex(32) + '\nPROOFBID_DB_PASSWORD=' + db_password + '\n')
settings = {'PROOFBID_PASSWORD': password,
    'PROOFBID_MONGO_URI': 'mongodb://proofbid:' + db_password + '@127.0.0.1:27018/proofbid?authSource=proofbid',
    'PROOFBID_TRANSPORT': 'openshell', 'PROOFBID_SANDBOX': 'cody',
    'PROOFBID_MODEL': 'nemotron-3-nano:30b', 'PROOFBID_STATE': str(root/'.state')}
write_private(runtime_path, ''.join('export ' + k + '=' + shlex.quote(v) + '\n' for k,v in settings.items()))
write_private(root/'LOGIN.txt', 'Username: proofbid\nPassword: ' + password + '\nUse only localhost or an SSH tunnel.\n')
print('Created owner-readable .env, .runtime.env and LOGIN.txt. Keep these on the GB10; do not share them.')
