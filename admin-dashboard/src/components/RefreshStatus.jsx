import React, { useEffect, useState } from 'react';

function describe(updatedAt, now) {
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} h ago`;
}

// "Updated 2 min ago" with a refresh button, for pages showing live data.
export default function RefreshStatus({ updatedAt, onRefresh, loading }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="refresh-status">
      <span className="muted" aria-live="polite">
        {loading ? 'Refreshing…' : updatedAt ? `Updated ${describe(updatedAt, now)}` : ''}
      </span>
      <button
        type="button"
        className="ui-button ui-button-secondary refresh-button"
        onClick={onRefresh}
        disabled={loading}
      >
        <span aria-hidden="true" className={loading ? 'is-spinning' : ''}>
          ↻
        </span>
        Refresh
      </button>
    </div>
  );
}
