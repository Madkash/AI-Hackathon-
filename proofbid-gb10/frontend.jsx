import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';

async function api(path, body) {
  const r = await fetch(path, body === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || (data.detail ? JSON.stringify(data.detail) : 'Request failed'));
  return data;
}
async function fileText(file) {
  if (file.size > 1900000) throw new Error('Choose files smaller than 1.9 MB.');
  if (!file.name.toLowerCase().endsWith('.pdf')) return file.text();
  const r = await fetch('/api/extract-pdf', {method:'POST', headers:{'Content-Type':'application/pdf'}, body:await file.arrayBuffer()});
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'PDF extraction failed');
  return data.text;
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const a = document.createElement('a'); a.href=url; a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function App() {
  const [text,setText]=useState(''), [title,setTitle]=useState('Pasted RFP');
  const [docs,setDocs]=useState([]), [product,setProduct]=useState({}), [productSource,setProductSource]=useState('No configuration');
  const [message,setMessage]=useState('Upload your RFP, supplier evidence and JSON configuration.');
  const [result,setResult]=useState(null), [selected,setSelected]=useState(null), [filter,setFilter]=useState('ALL');
  const [busy,setBusy]=useState(false), [history,setHistory]=useState([]), [note,setNote]=useState('');
  const [job,setJob]=useState(sessionStorage.getItem('proofbid-job'));
  const show = data => {setResult(data); setSelected(data.requirements[0]?.id); setNote(data.requirements[0]?.review_note || '');};
  async function task(fn) {setBusy(true); try {await fn();} catch(e){setMessage(e.message);} finally{setBusy(false);}}
  useEffect(()=>{
    if (!job) return;
    let cancelled=false, timer;
    async function poll() {
      try {
        const j=await api('/api/jobs/'+job);
        if(cancelled) return;
        setMessage(j.state==='queued'?'Queued…':`Reviewing evidence: ${j.completed || 0} / ${j.total || '?'} requirements`);
        if(j.state==='failed') {sessionStorage.removeItem('proofbid-job');setJob(null);setMessage(j.error);return;}
        if(j.state==='completed') {
          const data=await api('/api/analyses/'+j.result_id);
          if(cancelled) return;
          show(data);sessionStorage.removeItem('proofbid-job');setJob(null);setMessage('Analysis saved. Inspect every requirement and its citations before use.');return;
        }
        timer=setTimeout(poll,3000);
      } catch(e){if(!cancelled){setMessage(e.message+' — retrying connection.');timer=setTimeout(poll,5000);}}
    }
    poll();return ()=>{cancelled=true;clearTimeout(timer);};
  },[job]);
  const row=result?.requirements.find(r=>r.id===selected);
  const statuses=['VERIFIED','DOCUMENT SUPPORTED','PARTIAL','CONFLICT','MISSING'];
  const disabled=busy || !!job;
  const cell=value=>{let s=String(value??'');if(/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  function exportCsv() {
    const rows=[['ID','Requirement','Status','Finding','Reviewed','Review note','Evidence'],...result.requirements.map(r=>[r.id,r.requirement,r.status,r.finding,r.reviewed,r.review_note||'',r.evidence.map(e=>`${e.source} / ${e.location}: ${e.excerpt}`).join(' | ')])];
    download('proofbid-matrix.csv','\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n'),'text/csv');
  }
  function exportDraft() {
    download('proofbid-draft.md',[`# ${result.title}`,'DRAFT — submission approval required. Review marks do not authenticate supplier claims.',result.method,...result.requirements.flatMap(r=>[`\n## ${r.id}: ${r.requirement}`,`Status: ${r.status}; reviewed: ${r.reviewed}`,r.draft,...r.evidence.map(e=>`- ${e.source} / ${e.location}: ${e.excerpt}`)])].join('\n'),'text/markdown');
  }
  return <><aside className="sidebar"><a className="brand" href="/">p<span>ProofBid</span></a><div className="workspace">SUPPLIER WORKSPACE</div><div className="side-note">Local Nemotron<br/>Evidence review</div></aside><main>
    <header><div>ProofBid / GB10 workspace</div></header>
    <section className="intro"><div><h1>Know what you can prove.</h1><p>Turn buyer requirements into traceable responses.</p></div></section>
    <section className="input-card"><h2>Start an analysis</h2><div className="upload-grid">
      <label className="upload">Buyer RFP<input disabled={disabled} type="file" accept=".txt,.md,.pdf" onChange={e=>{const f=e.target.files[0];if(f)task(async()=>{setText(await fileText(f));setTitle(f.name);});}}/></label>
      <label className="upload">Supplier documents ({docs.length})<input disabled={disabled} type="file" multiple accept=".txt,.md,.pdf" onChange={e=>{const files=[...e.target.files];task(async()=>{if(files.length>30)throw new Error('Maximum 30 documents');const next=[];for(const f of files)next.push({name:f.name,text:await fileText(f)});setDocs(next);});}}/></label>
      <label className="upload">Configuration: {productSource}<input disabled={disabled} type="file" accept=".json" onChange={e=>{const f=e.target.files[0];if(f)task(async()=>{const p=JSON.parse(await fileText(f));if(!p||Array.isArray(p)||typeof p!=='object')throw new Error('Configuration must be an object');setProduct(p);setProductSource(f.name);});}}/></label>
    </div><label className="field-label" htmlFor="rfp">RFP text — review before submitting</label><textarea id="rfp" rows={6} disabled={disabled} value={text} onChange={e=>setText(e.target.value)}/>
    <button className="primary" disabled={disabled} onClick={()=>task(async()=>{const j=await api('/api/analyze',{text,title,documents:docs,product,product_source:productSource});sessionStorage.setItem('proofbid-job',j.job_id);setJob(j.job_id);})}>Analyze with local AI</button></section>
    <p role="status" aria-live="polite">{message}</p>
    {result&&<section><div className="result-heading"><h2>{result.title}</h2><div><button className="secondary" onClick={exportCsv}>Export matrix</button> <button className="primary" onClick={exportDraft}>Download draft</button></div></div>
      {result.demo&&<p className="demo-banner">FICTIONAL SAMPLE — not actual certification evidence</p>}
      <p>{result.readiness}% configuration verified · {result.requirements.filter(r=>r.reviewed).length}/{result.requirements.length} reviewed</p><p className="method">{result.method}</p>
      <div className="filters">{['ALL',...statuses].map(s=><button key={s} onClick={()=>setFilter(s)} aria-pressed={filter===s}>{s}</button>)}</div>
      <div className="analysis-grid"><section className="matrix"><table><thead><tr><th>Requirement</th><th>Status</th></tr></thead><tbody>{result.requirements.filter(r=>filter==='ALL'||r.status===filter).map(r=><tr key={r.id}><td><button className="row-button" onClick={()=>{setSelected(r.id);setNote(r.review_note||'');}}>{r.id} · {r.requirement}</button></td><td>{r.status}{r.reviewed?' · reviewed':''}</td></tr>)}</tbody></table></section>
      {row&&<aside className="detail"><h3>{row.requirement}</h3><p>{row.finding}</p>{row.evidence.map((e,i)=><div className="evidence" key={i}><strong>{e.source}</strong><small>{e.location}</small><blockquote>{e.excerpt}</blockquote><small>{e.scope}</small></div>)}<label htmlFor="note">Review note</label><textarea id="note" value={note} onChange={e=>setNote(e.target.value)} maxLength={2000}/><button disabled={busy} className="secondary" onClick={()=>task(async()=>{const updated=await api(`/api/analyses/${result.id}/review/${row.id}`,{reviewed:!row.reviewed,note});setResult(updated);setMessage('Review saved.');})}>{row.reviewed?'Mark unreviewed':'Mark reviewed'}</button></aside>}</div></section>}
    <footer><button className="secondary" onClick={()=>task(async()=>setHistory(await api('/api/history')))}>Recent analyses</button></footer>{history.map(h=><button key={h.id} className="secondary" onClick={()=>task(async()=>show(await api('/api/analyses/'+h.id)))}>{h.title}</button>)}
  </main></>;
}
createRoot(document.getElementById('root')).render(<App/>);
