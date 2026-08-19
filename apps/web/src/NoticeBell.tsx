import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { computeNotices, type Notice } from './notify';
import { Icon } from './operator/Icon';
import { loadSession } from './session';
import { todayIso, useStore } from './store';

/**
 * The one in-app notification bell (batch 2). `computeNotices` is derived live —
 * there is no read-state to persist (م9) — so the panel only clears its unread dot
 * on open (pure view state). Rows are real buttons; a notice with no tenderId is
 * disabled with a title saying why it cannot open a file.
 *
 * `portal` selects the link target and the surrounding chrome:
 *  - operator / admin → the shell topbar bell (`.op-notif`, dot + foot).
 *  - public           → the paper top-bar bell (`.bell-*`, numeric count badge).
 */
export type NoticePortal = 'operator' | 'admin' | 'public';

export function NoticeBell({ portal }: { portal: NoticePortal }) {
  const { t } = useTranslation();
  const { state } = useStore();
  const notices = computeNotices(state, todayIso());
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // portal-specific jump target; null → the notice has no tender file to open.
  const hrefFor = (n: Notice): string | null => {
    if (!n.tenderId) return null;
    if (portal === 'admin') return `#/admin/review/${n.tenderId}`;
    if (portal === 'public') return loadSession() ? `#/operator/t/${n.tenderId}` : '#/operator';
    return `#/operator/t/${n.tenderId}`;
  };

  const openNotice = (href: string | null) => {
    setOpen(false);
    if (href) window.location.hash = href;
  };

  // ---------- public paper top-bar ----------
  if (portal === 'public') {
    return (
      <div className="bell-wrap" ref={ref}>
        <button className="bell" aria-label={t('notices.title')} onClick={() => setOpen((o) => !o)}>
          <Icon name="bell" size={17} />
          {notices.length > 0 && <span className="bell__count mono">{notices.length}</span>}
        </button>
        {open && (
          <div className="bell-panel">
            <div className="bell-panel__head">{t('notices.title')}</div>
            {notices.length === 0 ? (
              <div className="bell-panel__empty">{t('notices.empty')}</div>
            ) : (
              <div className="bell-list">
                {notices.map((n) => {
                  const href = hrefFor(n);
                  return (
                    <button
                      key={n.id}
                      className={`bell-item bell-item--${n.severity}`}
                      disabled={!href}
                      title={href ? undefined : t('notices.noTarget')}
                      onClick={() => openNotice(href)}
                    >
                      {t(`notices.${n.key}`, n.params)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ---------- operator / admin shell topbar ----------
  const footKey = portal === 'admin' ? 'adnav.notifFoot' : 'notif.foot';
  return (
    <div className="op-notif" ref={ref}>
      <button
        className="op-iconbtn"
        title={t('notif.title')}
        aria-label={t('notif.title')}
        onClick={() => {
          setOpen((o) => !o);
          setRead(true);
        }}
      >
        <Icon name="bell" size={17} />
        {notices.length > 0 && !read && <span className="op-notif__dot" />}
      </button>
      {open && (
        <div className="op-panel op-notif__panel">
          <div className="op-notif__head">
            <span className="op-notif__title">{t('notif.title')}</span>
          </div>
          {notices.length === 0 ? (
            <div className="op-notif__empty">{t('notif.empty')}</div>
          ) : (
            notices.map((n) => {
              const href = hrefFor(n);
              return (
                <button
                  key={n.id}
                  className="op-notif__item"
                  disabled={!href}
                  title={href ? undefined : t('notices.noTarget')}
                  onClick={() => openNotice(href)}
                >
                  <span className={`op-notif__pt op-notif__pt--${n.severity}`} />
                  <span className="op-notif__body">
                    <span className="op-notif__t">{t(`notices.${n.key}`, n.params)}</span>
                    {n.params.code != null && (
                      <span className="op-notif__sub">
                        <span className="op-code">{String(n.params.code)}</span>
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
          <div className="op-notif__foot">{t(footKey)}</div>
        </div>
      )}
    </div>
  );
}
