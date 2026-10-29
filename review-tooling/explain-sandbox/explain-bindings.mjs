// READ ONLY GET: lists every EXPLAIN-named binding of the production Worker by name and type; values only for plain_text. Run through with-cf.mjs.
const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/rabbit-hole-app/settings`, { headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` } });
const j = await r.json(); const b = j.result?.bindings || [];
console.log(JSON.stringify(b.filter(x => /EXPLAIN/.test(x.name)).map(x => ({ name: x.name, type: x.type, text: x.type === 'plain_text' ? x.text : undefined }))));
