import React, { useEffect, useRef } from 'react';

// Side panel for a record's details, so the list underneath keeps its place.
export default function DetailDrawer({ open, title, subtitle, onClose, children, footer }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        ref={panelRef}
        tabIndex={-1}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="drawer-header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <button type="button" className="dialog-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}

export function DrawerSection({ title, children }) {
  return (
    <section className="drawer-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function DrawerFacts({ items }) {
  return (
    <dl className="drawer-facts">
      {items
        .filter(([, value]) => value !== undefined)
        .map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value ?? '—'}</dd>
          </div>
        ))}
    </dl>
  );
}
