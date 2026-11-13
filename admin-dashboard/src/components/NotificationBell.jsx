import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';

const REFRESH_MS = 2 * 60 * 1000;

// Top-bar bell listing things that need a manager's attention.
export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const response = await client.get('/notifications');
      setItems(response.data.items || []);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="notification-trigger"
        aria-label={total ? `Alerts, ${total} need attention` : 'Alerts'}
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          if (!open) load();
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 3a6 6 0 0 0-6 6v3.6L4.3 15.5A1 1 0 0 0 5.2 17h13.6a1 1 0 0 0 .9-1.5L18 12.6V9a6 6 0 0 0-6-6Zm0 18a2.5 2.5 0 0 0 2.4-2h-4.8a2.5 2.5 0 0 0 2.4 2Z"
            fill="currentColor"
          />
        </svg>
        {total ? <span className="notification-count">{total > 99 ? '99+' : total}</span> : null}
      </button>
      {open ? (
        <div className="notification-panel" role="dialog" aria-label="Alerts">
          <header>
            <strong>Needs attention</strong>
            <button type="button" className="data-table-link" onClick={load}>
              Refresh
            </button>
          </header>
          {failed ? (
            <p className="notification-empty">Alerts could not be loaded.</p>
          ) : items.length ? (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.href}
                    className={`notification-item is-${item.severity}`}
                    onClick={() => setOpen(false)}
                  >
                    <span className="notification-dot" aria-hidden="true" />
                    <span>
                      <strong>{item.title}</strong>
                      {item.detail ? <small>{item.detail}</small> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="notification-empty">You’re all caught up.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
