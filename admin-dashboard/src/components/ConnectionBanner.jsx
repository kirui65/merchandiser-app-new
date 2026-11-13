import React, { useEffect, useState } from 'react';
import { API_STATUS_EVENT } from '../api/client';

// Shown when the API cannot be reached, instead of leaving pages empty.
export default function ConnectionBanner() {
  const [offline, setOffline] = useState(false);
  const [browserOffline, setBrowserOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const onStatus = (event) => setOffline(!event.detail.reachable);
    const onOnline = () => setBrowserOffline(false);
    const onOffline = () => setBrowserOffline(true);
    window.addEventListener(API_STATUS_EVENT, onStatus);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener(API_STATUS_EVENT, onStatus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (!offline && !browserOffline) return null;
  return (
    <div className="connection-banner" role="alert">
      <span aria-hidden="true">⚠</span>
      <span>
        {browserOffline
          ? 'You are offline. Check your internet connection.'
          : 'Can’t reach the server right now. Data on this page may be out of date.'}
      </span>
      <button type="button" onClick={() => window.location.reload()}>
        Try again
      </button>
    </div>
  );
}
