"""One durable queue consumer per GB10. Interrupted jobs fail explicitly."""
from datetime import datetime, timezone
import fcntl
import json
import logging
import os
from pathlib import Path
import time
import subprocess
from pymongo import ReturnDocument
from store import db, initialize
from local_llm import analyze_local
CHECKS_DIR = Path(__file__).parent / 'checks'

def run_verification_checks(result):
    """Attach live PASS/FAIL evidence from manifest-mapped scripts. Never fails the job."""
    try:
        manifest = json.loads((CHECKS_DIR / 'manifest.json').read_text())
    except Exception:
        return
    for req in result.get('requirements', []):        # ← key name TBD, see below
        text = (req.get('text') or '').lower()
        for entry in manifest.get('checks', []):
            if not entry.get('testable'):
                continue
            if any(k in text for k in entry.get('keywords', [])):
                try:
                    proc = subprocess.run(['bash', str(CHECKS_DIR / entry['script'])],
                                          capture_output=True, text=True, timeout=60)
                    verdict = proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else 'FAIL | no output'
                except subprocess.TimeoutExpired:
                    verdict = 'FAIL | check timed out (60s)'
                req['live_check'] = {'script': entry['script'], 'verdict': verdict,
                                     'passed': proc.returncode == 0 if 'proc' in dir() else False}
                break
def main():
    if os.environ.get('PROOFBID_TRANSPORT') != 'openshell':
        raise RuntimeError('GB10 worker requires OpenShell transport.')
    state = Path(os.environ.get('PROOFBID_STATE', '.state'))
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    lock = (state/'worker.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    initialize()
    db.jobs.update_many({'state': 'running'}, {'$set': {'state': 'failed', 'error': 'Worker interrupted. Submit a new analysis; no automatic rerun.'}})
    while True:
        try:
            item = db.jobs.find_one_and_update({'state': 'queued'}, {'$set': {'state': 'running'}},
                sort=[('created', 1)], return_document=ReturnDocument.AFTER)
            if item is None:
                time.sleep(2)
                continue
            ident = item['_id']
            try:
                body = item['input']
                def progress(completed, total):
                    db.jobs.update_one({'_id': ident}, {'$set': {'completed': completed, 'total': total}})
                result = analyze_local(body['text'], body['product'], body['documents'], body['product_source'], body['title'], progress=progress)
                run_verification_checks(result)
                result.update({'_id': ident, 'id': ident, 'created': datetime.now(timezone.utc).isoformat(), 'review_events': []})
                db.results.replace_one({'_id': ident}, result, upsert=True)
                db.jobs.update_one({'_id': ident}, {'$set': {'state': 'completed', 'result_id': ident}, '$unset': {'input': ''}})
            except Exception as exc:
                logging.exception('Job %s failed', ident)
                db.jobs.update_one({'_id': ident}, {'$set': {'state': 'failed', 'error': 'Analysis failed (' + type(exc).__name__ + ': ' + str(exc)[:300] + '). Check model and sandbox readiness. No fallback used.'}, '$unset': {'input': ''}})
        except Exception as exc:
            logging.error('Queue unavailable: %s', type(exc).__name__)
            time.sleep(5)

if __name__ == '__main__':
    main()
