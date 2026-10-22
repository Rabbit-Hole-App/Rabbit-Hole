import {useEffect,useRef,useState} from 'react';
import {formatCredits} from './account-usage.js';

// Inline, explicit execution controls. Parent owns saved-ticket storage and source scope.
export default function InlineCodeRunPreview({client,savedTicket=null,onClose}) {
  const [quote,setQuote]=useState(null),[ticket,setTicket]=useState(savedTicket);
  const [job,setJob]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const active=useRef(null),mounted=useRef(false);
  useEffect(()=>{
    mounted.current=true;active.current=null;setBusy(false);setQuote(null);setJob(null);setError('');setTicket(savedTicket);
    const controller=new AbortController();
    client.quote({signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setQuote(value);}).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);});
    return()=>{mounted.current=false;controller.abort();active.current?.abort();};
  },[client]);
  useEffect(()=>{
    if(!job)return;
    let relevant=true;
    client.validateCurrent().catch(cause=>{if(relevant){setJob(null);setError(cause.message);}});
    return()=>{relevant=false;};
  });
  async function act(kind){
    if(busy)return;
    const controller=new AbortController();active.current=controller;setBusy(true);setError('');
    const onProgress=value=>{if(mounted.current&&active.current===controller&&!controller.signal.aborted){setJob(value);setTicket(client.getTicket()||ticket);}};
    try{
      const result=kind==='run'?await client.run({confirmed:true,maxReservedMicros:quote.maximumReservedMicros,signal:controller.signal,onProgress,onTicket:value=>{if(mounted.current&&active.current===controller)setTicket(value);}}):await client.resume(ticket,{signal:controller.signal,onProgress});
      if(mounted.current&&active.current===controller&&!controller.signal.aborted){setTicket(result.ticket);setJob(result.job);}
    }catch(cause){if(mounted.current&&active.current===controller){setTicket(client.getTicket()||ticket);setJob(null);setError(cause.message||'Waiting stopped. Resume explicitly; do not submit again.');}}
    finally{if(mounted.current&&active.current===controller)setBusy(false);}
  }
  async function cancel(){
    const currentTicket=client.getTicket()||ticket;
    if(!currentTicket)return;
    const previous=active.current,controller=new AbortController();active.current=controller;previous?.abort();setBusy(true);setError('');
    try{const result=await client.cancel(currentTicket,{signal:controller.signal});if(mounted.current&&active.current===controller){setTicket(result.ticket);setJob(result.job);}}
    catch(cause){if(mounted.current&&active.current===controller)setError(cause.message);}
    finally{if(mounted.current&&active.current===controller)setBusy(false);}
  }
  const close=()=>{active.current?.abort();onClose?.();};
  const output=job?.result;
  return <section data-inline-code-run className="space-y-2 rounded-xl border border-line p-3 text-xs text-ink" aria-label="Run JavaScript" onPointerDown={event=>event.stopPropagation()} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}}}>
    <div className="flex items-center justify-between"><strong>Run JavaScript</strong><button type="button" onClick={close}>Close</button></div>
    <p>Runs this exact JavaScript source with JSON input. Use an explicit return for a result. Python is not supported.</p>
    <p>No network or app credentials are supplied. Execution results are separate from model suggestions and do not change the card.</p>
    {!quote&&!error&&<p role="status">Checking execution availability...</p>}
    {quote&&!quote.available&&!ticket&&<p>Execution is not configured.</p>}
    {quote?.available&&!ticket&&<div className="space-y-2"><p>Maximum reservation: {formatCredits(quote.maximumReservedMicros)}. Actual cost is unknown. Execution can incur cost before results are viewed; cancellation does not promise a refund.</p><button type="button" data-inline-code-run-start disabled={busy} className="h-7 rounded-lg bg-ink px-2.5 font-medium text-white disabled:opacity-50" onClick={()=>act('run')}>Run with this reservation</button></div>}
    {ticket&&<div className="flex flex-wrap gap-2"><span>Saved execution ticket</span><button type="button" disabled={busy} onClick={()=>act('resume')}>Resume execution status</button><button type="button" onClick={cancel}>Request cancellation</button></div>}
    {busy&&<p role="status">{job?.phase||'Waiting for execution status'}...</p>}
    {job&&<div data-inline-code-output className="space-y-1"><p>Execution: {job.phase}. Source snapshot: {job.sourceSha256.slice(0,12)}.</p>{job.reason&&<p>{job.reason}</p>}
      {output?.stdout?.length>0&&<pre aria-label="Execution stdout" className="max-h-48 overflow-auto whitespace-pre-wrap">{output.stdout.map(line=>`[${line.level}] ${line.text}`).join('\n')}</pre>}
      {output?.status==='ok'&&<pre aria-label="Execution result" className="max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(output.result,null,2)}</pre>}
      {output?.error&&<p role="alert">{output.error.message}</p>}
      {(job.phase==='unknown'||job.phase==='cancelled'||output?.status==='timeout')&&<p>Termination is not confirmed for an execution that started. Its reservation remains held. No automatic retry.</p>}
    </div>}
    {error&&<p role="alert">{error}</p>}
    <p>Closing stops local waiting only; it does not confirm cancellation of remote execution.</p>
  </section>;
}
