const PATH = '/internal/cad-budget-alert';
const valid = value => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).every(key => key === 'month' || key === 'kind') &&
  value.month === new Date().toISOString().slice(0, 7) && ['model', 'transfer'].includes(value.kind);
const configuredToken = env => typeof env.CAD_BUDGET_ALERT_TOKEN === 'string' && env.CAD_BUDGET_ALERT_TOKEN.length >= 32;
const result = (status, ok = false) => Response.json({ok}, {status});

export async function cadBudgetAlert(req, env, {sendEmail}) {
  if (req.method !== 'POST') return result(405);
  if (!configuredToken(env)) return result(503);
  // Compare fixed-length digests rather than leaking token prefix timing.
  const digest = async text => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const supplied = req.headers.get('authorization') || '';
  if (supplied.length > 1024) return result(401);
  const [a,b] = await Promise.all([digest(supplied),digest(`Bearer ${env.CAD_BUDGET_ALERT_TOKEN}`)]);
  let difference=0; for(let i=0;i<a.length;i++)difference |= a[i]^b[i];
  if(difference)return result(401);
  const recipient=env.CAD_BUDGET_ALERT_EMAIL;
  if(typeof recipient!=='string'||recipient.length>254||!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(recipient))return result(503);
  let body;
  try {
    const reader=req.body?.getReader(); if(!reader)return result(400);
    let size=0, chunks=[];
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>256){await reader.cancel();return result(413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    body=JSON.parse(new TextDecoder().decode(bytes));
  } catch { return result(400); }
  if(!valid(body))return result(400);
  try {
    const sent=await sendEmail(env,recipient,'Rabbit Hole CAD monthly budget reached',
      `CAD ${body.kind} budget reached for ${body.month} (UTC). Further CAD work is paused until its budget permits it.`,
      {idempotencyKey:`cad-budget-${body.month}-${body.kind}`});
    return result(sent?200:502,Boolean(sent));
  } catch { return result(502); }
}

// Call outside the budget actor's mutex. Persist the monthly notified flag only
// after true; Resend's idempotency key additionally protects ambiguous retries.
export async function notifyCadBudget(env, value) {
  if(!valid(value)||!configuredToken(env)||!env.CONTROL_PLANE?.fetch)return false;
  try {
    const response=await env.CONTROL_PLANE.fetch(new Request(`https://control-plane${PATH}`,{
      method:'POST',headers:{authorization:`Bearer ${env.CAD_BUDGET_ALERT_TOKEN}`,'content-type':'application/json'},
      body:JSON.stringify(value),redirect:'error',signal:AbortSignal.timeout(5000),
    }));
    return response.ok&&(await response.json()).ok===true;
  } catch { return false; }
}
