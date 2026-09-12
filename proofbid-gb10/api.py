"""Authenticated single-operator FastAPI service. Run with one Uvicorn worker."""
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
import uuid
from threading import Lock
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, Field, ConfigDict, model_validator
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.concurrency import run_in_threadpool
from store import db, initialize, public
from pdf_input import pdf_text

ROOT = Path(__file__).resolve().parent
PASSWORD = os.environ['PROOFBID_PASSWORD']
if len(PASSWORD) < 32:
    raise RuntimeError('Use a generated password of at least 32 characters.')
security = HTTPBasic()
queue_lock = Lock()

def authenticate(credentials: HTTPBasicCredentials = Depends(security)):
    if not (secrets.compare_digest(credentials.username.encode(), b'proofbid') and
            secrets.compare_digest(credentials.password.encode(), PASSWORD.encode())):
        raise HTTPException(401, 'Invalid login', headers={'WWW-Authenticate': 'Basic'})
    return 'proofbid'

@asynccontextmanager
async def lifespan(app):
    if not (ROOT / 'web/gb10.js').is_file():
        raise RuntimeError('Build the React frontend with npm run build before starting.')
    await run_in_threadpool(initialize)
    yield

app = FastAPI(title='ProofBid GB10', lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost'])

@app.middleware('http')
async def boundary(request, call_next):
    if request.headers.get('origin') not in (None, 'http://127.0.0.1:8765', 'http://localhost:8765'):
        return JSONResponse({'error': 'Cross-origin request denied'}, status_code=403)
    if request.method in ('POST', 'PUT', 'PATCH'):
        total = 0
        chunks = []
        async for chunk in request.stream():
            total += len(chunk)
            if total > 2_000_000:
                return JSONResponse({'error': 'Request limit is 2 MB'}, status_code=413)
            chunks.append(chunk)
        request._body = b''.join(chunks)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'"
    return response

class Document(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=240)
    text: str = Field(max_length=24000)

class Analysis(BaseModel):
    model_config = ConfigDict(extra='forbid')
    text: str = Field(min_length=1, max_length=24000)
    documents: list[Document] = Field(default_factory=list, max_length=30)
    product: dict = Field(default_factory=dict)
    product_source: str = Field(default='product.json', max_length=240)
    title: str = Field(default='RFP', max_length=180)

    @model_validator(mode='after')
    def bounded(self):
        if not self.text.strip() or sum(len(d.text) for d in self.documents) > 24000:
            raise ValueError('Provide RFP text and at most 24,000 document characters in total.')
        if len(json.dumps(self.product)) > 100000:
            raise ValueError('Configuration too large')
        return self

@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return JSONResponse({'error': exc.detail}, status_code=exc.status_code, headers=exc.headers)

@app.get('/api/health')
def health():
    return {'ok': True, 'mode': 'openshell', 'jobs': True, 'reviews': True,
            'model': 'nemotron-3-nano:30b', 'note': 'Service liveness only, not inference readiness.'}

@app.post('/api/analyze', dependencies=[Depends(authenticate)], status_code=202)
def submit(body: Analysis):
    with queue_lock:
        if db.jobs.count_documents({'state': {'$in': ['queued', 'running']}}) >= 20:
            raise HTTPException(429, 'Queue full; wait for a job to finish.')
        ident = uuid.uuid4().hex
        db.jobs.insert_one({'_id': ident, 'id': ident, 'state': 'queued', 'created': datetime.now(timezone.utc).isoformat(),
                            'input': body.model_dump(), 'completed': 0, 'total': None})
    return {'job_id': ident, 'state': 'queued'}

@app.get('/api/jobs/{ident}', dependencies=[Depends(authenticate)])
def job(ident: str):
    item = public(db.jobs.find_one({'_id': ident}))
    if not item:
        raise HTTPException(404, 'Job not found')
    return item

@app.get('/api/history', dependencies=[Depends(authenticate)])
def history():
    return [public(item) for item in db.results.find({}, {'id': 1, 'created': 1, 'title': 1}).sort('created', -1).limit(20)]

@app.get('/api/analyses/{ident}', dependencies=[Depends(authenticate)])
def analysis(ident: str):
    item = public(db.results.find_one({'_id': ident}))
    if not item:
        raise HTTPException(404, 'Analysis not found')
    return item

class Review(BaseModel):
    reviewed: bool
    note: str = Field(default='', max_length=2000)

@app.post('/api/analyses/{ident}/review/{row_id}', dependencies=[Depends(authenticate)])
def review(ident: str, row_id: str, body: Review):
    now = datetime.now(timezone.utc).isoformat()
    event = {'row_id': row_id, 'reviewed': body.reviewed, 'note': body.note, 'at': now, 'reviewer': 'proofbid'}
    update = db.results.update_one({'_id': ident, 'requirements.id': row_id},
        {'$set': {'requirements.$.reviewed': body.reviewed, 'requirements.$.review_note': body.note},
         '$push': {'review_events': {'$each': [event], '$slice': -1000}}})
    if not update.matched_count:
        raise HTTPException(404, 'Requirement not found')
    return analysis(ident)

@app.post('/api/extract-pdf', dependencies=[Depends(authenticate)])
async def extract_pdf(request: Request):
    try:
        text = await run_in_threadpool(pdf_text, await request.body())
        if len(text) > 24000:
            raise ValueError('PDF text exceeds 24,000 characters; split the document.')
        return {'text': text}
    except Exception:
        raise HTTPException(400, 'Could not extract PDF. Use a smaller text-based PDF or TXT file.')

@app.get('/', dependencies=[Depends(authenticate)])
def index():
    return FileResponse(ROOT / 'react-index.html')

@app.get('/{asset}', dependencies=[Depends(authenticate)])
def static(asset: str):
    if asset not in ('gb10.js', 'style.css'):
        raise HTTPException(404, 'Not found')
    return FileResponse(ROOT / 'web' / asset)
