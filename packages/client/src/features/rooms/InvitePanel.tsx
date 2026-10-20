import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, RefreshCw, Trash2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/errors';
import {
  useGetInviteQuery,
  useRevokeInviteMutation,
  useRotateInviteMutation,
} from '@/lib/api';

export const InvitePanel = ({ code }: { code: string }) => {
  const { data, isLoading } = useGetInviteQuery(code);
  const [rotate, { isLoading: rotating }] = useRotateInviteMutation();
  const [revoke, { isLoading: revoking }] = useRevokeInviteMutation();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const url = data?.url ?? null;

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Clipboard is blocked. Select the link and copy it manually.');
    }
  };

  const handleRotate = async () => {
    setError('');
    try {
      await rotate(code).unwrap();
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Could not rotate the invite'));
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm('Revoke this invite? Anyone holding the link will be locked out.')) return;
    setError('');
    try {
      await revoke(code).unwrap();
    } catch (cause) {
      setError(apiErrorMessage(cause, 'Could not revoke the invite'));
    }
  };

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Invite people</h2>
        <span className="text-xs text-cream-500">Owner only</span>
      </div>

      {isLoading ? <p className="mt-3 text-sm text-cream-400">Loading invite…</p> : null}

      {!isLoading && !url ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-cream-400">Invites are revoked. Rotate to mint a fresh link.</p>
          <button type="button" className="btn-primary w-full" onClick={() => void handleRotate()} disabled={rotating}>
            <RefreshCw size={15} /> {rotating ? 'Rotating…' : 'Create invite link'}
          </button>
        </div>
      ) : null}

      {url ? (
        <div className="mt-3 space-y-3">
          <div className="flex justify-center rounded-xl bg-cream-50 p-3">
            <QRCodeSVG value={url} size={148} bgColor="#fbf7ee" fgColor="#0b0a08" />
          </div>
          <div className="flex items-center gap-2">
            <input readOnly value={url} className="input text-xs" onFocus={(event) => event.currentTarget.select()} />
            <button type="button" onClick={() => void copy()} className="btn-ghost shrink-0 px-2.5" title="Copy invite link">
              {copied ? <Check size={15} className="text-mint" /> : <Copy size={15} />}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleRotate()}
              disabled={rotating}
              className="btn-ghost flex-1 text-xs"
            >
              <RefreshCw size={14} /> {rotating ? 'Rotating…' : 'Rotate'}
            </button>
            <button
              type="button"
              onClick={() => void handleRevoke()}
              disabled={revoking}
              className="btn-ghost flex-1 text-xs text-coral"
            >
              <Trash2 size={14} /> {revoking ? 'Revoking…' : 'Revoke'}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-coral">{error}</p> : null}
    </section>
  );
};
