import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FiChevronDown, FiHelpCircle, FiLogOut, FiTrash2, FiUser } from 'react-icons/fi';
import { DeleteAccountDialog } from './DeleteAccount';

const itemClass = 'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 transition cursor-pointer';

/**
 * The account button in the page header: the user's initials open a menu with who is signed in, patient details, the tour and
 * sign out, and last, set apart, deleting the account (which still asks for the password in its own dialog).
 * The menu is rendered into <body>: the header band clips its content (overflow-hidden, isolate), so a menu inside it would
 * be cut off and sit under the cards.
 */
export default function ProfileMenu({ name, phone, onEditPatient, onStartTour, onLogout, onDeleteAccount }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const root = useRef(null);
  const menu = useRef(null);
  const [place, setPlace] = useState(null);

  // Pin the menu under the button, right edges aligned; follow it on scroll and resize.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const r = root.current?.getBoundingClientRect();
      if (r) setPlace({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!root.current?.contains(e.target) && !menu.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (action) => () => {
    setOpen(false);
    action();
  };
  const initials = (name || '?').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('profile.menu')}
        title={t('profile.menu')}
        className="flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white py-1 pl-1 pr-2.5 shadow-2xs transition hover:bg-slate-50 cursor-pointer"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-700 text-xs font-semibold text-white" aria-hidden="true">{initials}</span>
        <FiChevronDown className={`text-slate-500 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && createPortal(
        <div
          ref={menu}
          role="menu"
          aria-label={t('profile.menu')}
          style={place ?? { visibility: 'hidden' }}
          className="fixed z-50 w-64 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
            {phone && <p className="truncate text-xs text-slate-500">{phone}</p>}
          </div>
          <div className="my-1 border-t border-slate-100" />
          {onEditPatient && (
            <button type="button" role="menuitem" onClick={choose(onEditPatient)} className={itemClass}>
              <FiUser className="text-sky-700" aria-hidden="true" />
              {t('dash.editProfile')}
            </button>
          )}
          {onStartTour && (
            <button type="button" role="menuitem" onClick={choose(onStartTour)} className={itemClass}>
              <FiHelpCircle className="text-sky-700" aria-hidden="true" />
              {t('tour.replayTitle')}
            </button>
          )}
          {onLogout && (
            <button type="button" role="menuitem" onClick={choose(onLogout)} className={itemClass}>
              <FiLogOut className="text-slate-500" aria-hidden="true" />
              {t('logout')}
            </button>
          )}
          {onDeleteAccount && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <button type="button" role="menuitem" onClick={choose(() => setDeleting(true))} className={`${itemClass} !text-rose-700 hover:!bg-rose-50`}>
                <FiTrash2 aria-hidden="true" />
                {t('deleteAccount')}
              </button>
            </>
          )}
        </div>,
        document.body,
      )}

      {deleting && <DeleteAccountDialog onDelete={onDeleteAccount} onClose={() => setDeleting(false)} />}
    </div>
  );
}
