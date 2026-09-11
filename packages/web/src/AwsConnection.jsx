import { useEffect, useState } from 'react';
import { Check, CircleAlert, ExternalLink } from 'lucide-react';
import { api, navigate } from './api.js';
import { Button, ConfirmDialog, Field, IconBtn, Input, SettingsRow, Tip } from './ui.jsx';
import AwsS3Access from './AwsS3Access.jsx';

const dataInfo = 'Your source, inputs, logs, and outputs stay in your AWS account. Small stores the connection details.';

// AWS installation lives alongside the other workspace connections.
export default function AwsConnection({ workspace, apps = [], onChanged }) {
  const [connection, setConnection] = useState(undefined), [jobName, setJobName] = useState('cpu-job');
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const load = async () => {
    try {
      const { connection } = await api('/api/byoc/connection');
      setConnection(connection); setError('');
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { setConnection(undefined); setAccountId(''); setJobName('cpu-job'); load(); }, [workspace]);
  useEffect(() => {
    if (connection) { setAccountId(connection.account_id); setJobName(connection.job_name); }
  }, [connection?.id, connection?.state]);
  useEffect(() => {
    if (!connection || !['pending', 'installed'].includes(connection.state)) return;
    const timer = setInterval(load, 5000); return () => clearInterval(timer);
  }, [connection?.id, connection?.state]);
  const install = async () => {
    if (!/^\d{12}$/.test(accountId) || !/^[a-z0-9-]{1,40}$/.test(jobName)) {
      setError('Enter a 12-digit AWS account ID and an app name using lowercase letters, numbers, or hyphens.'); return;
    }
    const popup = window.open('', '_blank');
    if (popup) popup.opener = null;
    setBusy(true); setError('');
    try {
      const d = await api('/api/byoc/install', { method: 'POST', body: JSON.stringify({ account_id: accountId, job_name: jobName }) });
      setConnection(d.connection);
      if (popup) popup.location.href = d.install_url;
      else window.location.assign(d.install_url);
    } catch (e) { if (popup) popup.close(); setError(e.message); } finally { setBusy(false); }
  };
  const connect = async () => {
    setBusy(true); setError('');
    try {
      const d = await api('/api/byoc/connect', { method: 'POST', body: '{}' });
      setConnection(d.connection); onChanged?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const d = await api('/api/byoc/disconnect', { method: 'POST', body: '{}' });
      setConnection(d.connection); setConfirmDisconnect(false); onChanged?.();
      const currentName = window.location.pathname.split('/')[2];
      if (apps.some((app) => app.name === currentName && app.aws_connection?.id === connection.id)) navigate('/apps');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const reconnect = ['installed', 'disconnected'].includes(connection?.state);
  return <div>
    <SettingsRow
      title={<span className="inline-flex items-center gap-2">Run in your AWS account<Tip label="Data privacy" info={dataInfo}><IconBtn type="button" aria-label="AWS data privacy information" aria-description={dataInfo}><CircleAlert size={16} strokeWidth={1.5} /></IconBtn></Tip></span>}
      desc={connection ? `Account ${connection.account_id} · ${connection.region}` : 'One connection for your workspace · us-east-1'}
    >
    {connection?.private ? <span className="inline-flex items-center gap-2 text-sm text-ink-2"><Check size={14} />Installed in your AWS</span>
      : connection?.state === 'connected' ? <Button variant="soft" size="sm" disabled={busy || !connection.can_deploy} title={connection.can_deploy ? 'Disconnect AWS' : 'Only the installer can disconnect AWS'} onClick={() => { setError(''); setConfirmDisconnect(true); }}><Check size={14} />Connected</Button>
      : connection !== undefined && <div className="flex flex-wrap justify-end gap-2">
        {(!connection || connection.can_deploy) && <Button variant="soft" size="sm" disabled={busy} onClick={reconnect ? connect : install}>
          {busy ? 'Working…' : connection?.state === 'installed' ? 'Finish connecting' : connection?.state === 'pending' ? 'Open AWS installation' : 'Connect AWS'}{!reconnect && <ExternalLink size={14} />}</Button>}
      </div>}
    </SettingsRow>
    {confirmDisconnect && <ConfirmDialog
      title="Disconnect AWS?"
      body={<><p>This disconnects AWS from Small for this workspace. Your AWS resources and data stay intact, and you can reconnect later. Existing access may take up to 3 minutes to expire.</p>{error && <p role="alert" className="mt-2 text-danger">{error}</p>}</>}
      confirmLabel={busy ? 'Disconnecting…' : 'Disconnect'}
      onConfirm={disconnect}
      onCancel={() => { if (!busy) { setConfirmDisconnect(false); setError(''); } }}
    />}
    {(connection === null || (connection?.state === 'pending' && connection.can_deploy)) && <div className="mt-3 grid max-w-sm gap-3">
      <Field label="AWS account ID"><Input aria-label="AWS account ID" inputMode="numeric" maxLength={12} placeholder="12-digit account ID" value={accountId} onChange={(e) => setAccountId(e.target.value.trim())} /></Field>
      <Field label="First app name"><Input aria-label="First app name" value={jobName} onChange={(e) => setJobName(e.target.value)} /></Field>
    </div>}
    {(connection === null || ['pending', 'installed'].includes(connection?.state)) && <ol className="mt-4 list-decimal space-y-1 pl-4 text-xs text-ink-3">
      <li>Click Connect AWS to open the installation in your AWS console.</li>
      <li>Sign in to{accountId ? ` AWS account ${accountId}` : ' your AWS account'}, review the resources and permissions, then click Create stack.</li>
      <li>When installation finishes, return here and click Finish connecting.</li>
    </ol>}
    {connection?.state === 'pending' && <p className="mt-3 text-xs text-ink-3">Waiting for AWS installation. This updates when the stack finishes registering.</p>}
    {connection?.state === 'installed' && <p className="mt-3 text-xs text-ink-3">AWS has registered the installation. Finish connecting verifies this account and workspace.</p>}
    {connection && !connection.can_deploy && connection.state !== 'connected' && <p className="mt-3 text-xs text-ink-3">{connection.owner_email} manages this connection.</p>}
    {error && !confirmDisconnect && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    {connection?.state === 'connected' && <AwsS3Access key={connection.id} connection={connection} />}
  </div>;
}
