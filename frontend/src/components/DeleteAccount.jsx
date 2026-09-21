import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiTrash2 } from 'react-icons/fi';

/**
 * Header button + confirmation dialog for permanently deleting the account.
 * `onDelete(password)` must reject with an Error carrying a readable message when the server refuses.
 */
export default function DeleteAccount({ onDelete }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setPassword('');
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!password) {
      setError(t('deleteAccountNeedPassword'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onDelete(password);
    } catch (err) {
      setError(err.message || t('deleteAccountFailed'));
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t('deleteAccount')}
        aria-label={t('deleteAccount')}
        className="p-2.5 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200/90 bg-white shadow-2xs transition cursor-pointer"
      >
        <FiTrash2 className="text-base" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={close}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && close()}
            onSubmit={submit}
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 id="delete-account-title" className="text-lg font-bold text-slate-900">{t('deleteAccountTitle')}</h2>
            <p className="text-sm text-slate-600">{t('deleteAccountWarning')}</p>
            <label className="block text-sm font-semibold text-slate-700">
              {t('deleteAccountPassword')}
              <input
                ref={input}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
              />
            </label>
            {error && <p role="alert" className="text-sm font-medium text-rose-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 cursor-pointer">
                {t('cancel')}
              </button>
              <button type="submit" disabled={busy} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 cursor-pointer">
                {busy ? t('deleteAccountBusy') : t('deleteAccountConfirm')}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
