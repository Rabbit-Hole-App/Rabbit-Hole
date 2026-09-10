import { useEffect, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { api } from './api.js';
import { Button, IconBtn, Input, SettingsRow } from './ui.jsx';

// The CLI requests access. The installer approves the exact folder here.
export default function AwsS3Access({ connection }) {
  const [state, setState] = useState(null), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [templateUrl, setTemplateUrl] = useState('');
  const [notice, setNotice] = useState('');
  const load = async () => {
    try {
      const next = await api('/api/byoc/access');
      setState(next); setError('');
      if (next.approval_enabled && !state?.approval_enabled && templateUrl) {
        setTemplateUrl(''); setNotice('Connection upgraded. You can now approve app folders here.');
      }
      if (state?.pending && !next.pending) {
        setTemplateUrl('');
        const approved = next.stable && (next.approved[state.pending.app_name] ?? null) === state.pending.s3_read;
        setNotice(approved ? 'Access approved. Your waiting deployment will continue automatically.' : 'This permission request is no longer pending.');
      }
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    // A CLI request must appear even when Settings was opened before deployment.
    const timer = setInterval(() => { if (!document.hidden) load(); }, state?.pending || templateUrl ? 5000 : 10000);
    return () => clearInterval(timer);
  }, [state?.pending?.id, state?.pending?.status, state?.approval_enabled, templateUrl]);
  const act = async (action) => {
    const popup = action === 'upgrade' ? window.open('', '_blank') : null;
    if (popup) popup.opener = null;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api('/api/byoc/access/' + action, { method: 'POST', body: JSON.stringify(action === 'upgrade' ? {} : { request_id: state.pending.id }) });
      if (action === 'upgrade') {
        setTemplateUrl(result.template_url);
        if (popup) popup.location.href = result.update_url; else window.location.assign(result.update_url);
      } else if (action === 'approve') {
        setState(result); setTemplateUrl(''); setNotice('Access approved. Your waiting deployment will continue automatically.');
      } else { setTemplateUrl(''); await load(); setNotice('Request cancelled. The waiting deployment will stop without uploading source.'); }
    } catch (e) { if (popup) popup.close(); setError(e.message); } finally { setBusy(false); }
  };
  const pending = state?.pending;
  return <div className="mt-5 border-t border-line pt-4">
    <div className="text-sm font-medium">S3 access</div>
    <p className="mt-1 text-xs text-ink-3">Each app can read its approved folder. Review new access here when you deploy.</p>
    {state && !state.approval_enabled && <div className="mt-3 rounded-lg border border-line p-4">
      <div className="text-sm font-medium">One-time AWS connection upgrade</div>
      <p className="mt-2 text-xs text-ink-3">Approve this installation update in AWS once. Afterward, approve each app’s S3 folder here and deployment continues automatically. Existing folders stay approved.</p>
      {connection.can_deploy && <div className="mt-3 flex gap-2"><Button variant="soft" size="sm" disabled={busy || !state.stable} onClick={() => act('upgrade')}>Upgrade in AWS<ExternalLink size={13} /></Button><Button variant="ghost" size="sm" disabled={busy} onClick={load}>Check upgrade</Button></div>}
    </div>}
    {state && !Object.keys(state.approved).length && <p className="mt-3 text-xs text-ink-3">No apps have S3 read access yet.</p>}
    {Object.entries(state?.approved || {}).map(([name, uri]) => <SettingsRow key={name} title={name} desc={uri}><span className="text-xs text-ink-3">{state.stable ? 'Read only' : 'AWS updating…'}</span></SettingsRow>)}
    {pending && <div className="mt-3 rounded-lg border border-line bg-side p-4">
      <div className="text-sm font-medium">{pending.app_name} · {['updating', 'applying'].includes(pending.status) ? 'Applying in AWS' : pending.status === 'stale' ? 'Request needs refreshing' : 'Awaiting your approval'}</div>
      <p className="mt-2 break-all text-sm">{pending.s3_read ? `Read ${pending.s3_read}` : 'Remove this app’s S3 access'}</p>
      <p className="mt-2 text-xs text-ink-3">{pending.status === 'stale' ? 'AWS permissions changed after this request. Cancel it and retry deploy.' : !state.approval_enabled ? 'Finish the one-time upgrade above, then approve this folder here.' : pending.s3_read ? 'This app can read files in this folder. It cannot list, write, or delete them. Approval resumes your waiting deployment.' : 'This removes the app’s S3 read access. Approval resumes your waiting deployment.'}</p>
      {connection.can_deploy ? <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="soft" size="sm" disabled={busy || !state.approval_enabled || !['pending', 'applying'].includes(pending.status)} onClick={() => act('approve')}>{busy ? 'Working…' : pending.status === 'applying' ? 'Retry approval' : 'Approve & deploy'}</Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={load}>Check approval</Button>
        <Button variant="ghost" size="sm" disabled={busy || ['updating', 'applying'].includes(pending.status)} onClick={() => act('dismiss')}>Cancel</Button>
      </div> : <p className="mt-3 text-xs text-ink-3">{connection.owner_email} manages this permission request.</p>}
    </div>}
      {templateUrl && !state?.approval_enabled && <div className="mt-3">
        <p className="mb-2 text-xs text-ink-3">In AWS, use Replace existing template. If the template URL is empty, copy this generated URL into Amazon S3 URL. Review the changes and choose Update stack.</p>
        <div className="flex gap-2"><Input readOnly aria-label="AWS permission template URL" value={templateUrl} /><IconBtn aria-label="Copy template URL" onClick={async () => { try { await navigator.clipboard.writeText(templateUrl); setNotice('Template URL copied.'); } catch { setError('Select and copy the template URL.'); } }}><Copy size={14} /></IconBtn></div>
      </div>}
    {notice && <p role="status" className="mt-3 text-xs text-ink-3">{notice}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
  </div>;
}
