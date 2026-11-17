import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { checkoutCredits, purchaseAmount } from './account-usage.js';
import { ConfirmDialog, IconBtn, Input, cn } from './ui.jsx';

// Buy credits (owner, 2026-10-29): the one purchase dialog, opened from Settings > AI usage and from the canvas gauge's popover.
// $20, $50, $100 or another amount in USD; the total is the amount picked, never a number of credits (no conversion exists yet).
// Buy goes to checkoutCredits, which charges nothing and adds nothing. Cancel, Close, Escape and a press outside change nothing.
// Rendered in place inside Settings (so Settings' Escape defers to it) and portaled by the gauge.
const PRESETS = [20, 50, 100];
const usd = amount => amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function BuyCreditsDialog({ onClose }) {
  const [pick, setPick] = useState(PRESETS[0]); // a preset amount, or 'other'
  const [other, setOther] = useState('');
  const [notice, setNotice] = useState(null);
  const box = useRef(null);
  const amount = pick === 'other' ? purchaseAmount(other) : pick;
  // Focus moves in on open and goes back to what opened it on close.
  useEffect(() => {
    const opener = document.activeElement;
    box.current?.querySelector('[aria-checked="true"]')?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);
  const choose = value => { setPick(value); setNotice(null); };
  const option = (value, label) => (
    <button key={value} type="button" role="radio" aria-checked={pick === value} data-buy-amount={value} onClick={() => choose(value)}
      className={cn('h-8 rounded-lg border px-3 text-sm', pick === value ? 'border-ink bg-hover font-medium text-ink' : 'border-line text-ink-2 hover:bg-hover hover:text-ink')}>{label}</button>
  );
  return (
    <div data-buy-credits-dialog>
      <ConfirmDialog title="Buy credits" confirmLabel="Buy" confirmVariant="primary" confirmDisabled={amount == null} onCancel={onClose}
        onConfirm={() => { if (amount != null) setNotice(checkoutCredits(amount)); }}
        body={<span ref={box} className="relative block">
          <IconBtn type="button" aria-label="Close" title="Close" onClick={onClose} className="absolute -top-7 right-0"><X size={14} /></IconBtn>
          <span role="radiogroup" aria-label="Amount" className="flex flex-wrap gap-2">
            {PRESETS.map(value => option(value, `$${value}`))}
            {option('other', 'Other amount')}
          </span>
          {pick === 'other' && (
            <label className="flex items-center gap-2 pt-3 text-sm text-ink-2">
              Amount in USD
              <Input data-buy-other inputMode="decimal" autoFocus value={other} placeholder="0.00" className="w-32"
                aria-invalid={other !== '' && amount == null} onChange={event => { setOther(event.target.value); setNotice(null); }} />
            </label>
          )}
          {amount == null
            ? <span data-buy-hint className="block pt-3 text-xs text-ink-2">Enter a positive amount with up to two decimal places.</span>
            : <span data-buy-total className="block pt-3 text-base font-semibold text-ink tabular-nums">Total: {usd(amount)}</span>}
          <span role="status" data-buy-notice className={notice ? 'mt-3 block rounded-md bg-hover px-2 py-1.5 text-xs text-ink-2' : undefined}>{notice}</span>
        </span>}
      />
    </div>
  );
}
