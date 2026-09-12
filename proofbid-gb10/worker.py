"""One durable queue consumer per GB10. Interrupted jobs fail explicitly."""
from datetime import datetime, timezone
import fcntl
import logging
import os
from pathlib import Path
import time
from pymongo import ReturnDocument
from store import db, initialize
from local_llm import analyze_local
from local_agent import AgentUnavailable

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
                result.update({'_id': ident, 'id': ident, 'created': datetime.now(timezone.utc).isoformat(), 'review_events': []})
                db.results.replace_one({'_id': ident}, result, upsert=True)
                db.jobs.update_one({'_id': ident}, {'$set': {'state': 'completed', 'result_id': ident}, '$unset': {'input': ''}})
            except Exception as exc:
                message = str(exc)[:800] if isinstance(exc, AgentUnavailable) else 'Analysis failed (' + type(exc).__name__ + '). Check the input and service status.'
                logging.error('Job %s failed: %s', ident, message)
                db.jobs.update_one({'_id': ident}, {'$set': {'state': 'failed', 'error': message}, '$unset': {'input': ''}})
        except Exception as exc:
            logging.error('Queue unavailable: %s', type(exc).__name__)
            time.sleep(5)

if __name__ == '__main__':
    main()
