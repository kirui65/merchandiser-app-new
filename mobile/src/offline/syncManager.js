// Sync the offline sales queue in the background.
//
// The queue and API client are passed in so this module can be tested without
// starting SQLite or a React Native runtime. A retry may reach the API after
// the original request was already saved, so the server treats the same
// localId as an existing sale. Both a new sale and a duplicate response count
// as synced here.

/**
 * @typedef {object} QueueAdapter
 * @property {() => Array<{localId: string, payload: object}>} getPendingSales
 * @property {(localId: string) => void} markSynced
 * @property {(localId: string, errorMessage: string) => void} markFailed
 */

/**
 * @typedef {object} ApiClient
 * @property {(sale: object) => Promise<{status: number, data: any}>} postSale
 */

const MAX_ATTEMPTS_BEFORE_BACKOFF_CAP = 5;

export function createSyncManager({ queue, api, isOnline, subscribeToConnectivity, checkOnline = isOnline }) {
  let syncing = false;

  /**
   * Attempts to push every pending/failed sale in the local queue to the
   * backend. Safe to call repeatedly (e.g. on every connectivity-restored
   * event) — it no-ops if a sync is already in flight or the device is
   * offline.
   */
  async function syncPendingSales() {
    if (syncing) return { skipped: true, reason: 'already-syncing' };
    if (!(await isOnline())) return { skipped: true, reason: 'offline' };

    syncing = true;
    const results = { synced: 0, duplicates: 0, failed: 0, errors: [] };

    try {
      const now = Date.now();
      const pending = queue.getPendingSales().filter((item) => {
        const attempts = Number(item.attempts || 0);
        if (attempts >= MAX_ATTEMPTS_BEFORE_BACKOFF_CAP) return false;
        if (!attempts || !item.lastAttemptAt) return true;
        const retryDelay = Math.min(5 * 60 * 1000, 30 * 1000 * (2 ** (attempts - 1)));
        return now - new Date(item.lastAttemptAt).getTime() >= retryDelay;
      });

      for (const item of pending) {
        try {
          const response = await api.postSale({ localId: item.localId, ...item.payload });

          // 201 = newly created, 200 = duplicate localId already on the
          // server (dropped ack on a prior attempt) — both are "done".
          if (response.status === 201 || response.status === 200) {
            queue.markSynced(item.localId);
            if (response.data && response.data.duplicate) {
              results.duplicates += 1;
            } else {
              results.synced += 1;
            }
          } else if (response.status >= 400 && response.status < 500) {
            // Client error (e.g. validation failure) — not transient.
            // Mark failed but do not keep hammering it every sync cycle
            // beyond the attempt cap; surface it for manual review instead.
            queue.markFailed(item.localId, `HTTP ${response.status}: ${JSON.stringify(response.data)}`);
            results.failed += 1;
          } else {
            // Server error / unexpected — treat as transient, eligible for retry.
            queue.markFailed(item.localId, `HTTP ${response.status}`);
            results.failed += 1;
          }
        } catch (err) {
          // Network-level failure mid-request — transient, eligible for retry.
          queue.markFailed(item.localId, err.message || String(err));
          results.failed += 1;
          results.errors.push({ localId: item.localId, error: err.message || String(err) });
        }
      }
    } finally {
      syncing = false;
    }

    return results;
  }

  function isSyncing() {
    return syncing;
  }

  function start() {
    const unsubscribe = subscribeToConnectivity((online) => {
      if (online) syncPendingSales();
    });
    const interval = setInterval(syncPendingSales, 30 * 1000);
    Promise.resolve(checkOnline()).then((online) => {
      if (online) syncPendingSales();
    });
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }

  return { syncPendingSales, isSyncing, start, MAX_ATTEMPTS_BEFORE_BACKOFF_CAP };
}
