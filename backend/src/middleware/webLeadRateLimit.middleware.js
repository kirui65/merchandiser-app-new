const WINDOW_MS = 15 * 60 * 1000;
const MAX_SUBMISSIONS = 10;
const attemptsByIp = new Map();
let lastCleanup = 0;

function cleanupExpiredAttempts(now) {
  // Without this, a one-off request from every new IP would keep growing the
  // in-memory map for the lifetime of the process.
  if (now - lastCleanup < WINDOW_MS) return;
  for (const [ip, attempts] of attemptsByIp) {
    if (!attempts.some((time) => time > now - WINDOW_MS)) attemptsByIp.delete(ip);
  }
  lastCleanup = now;
}

// Small, Redis-free sliding window. Render instances maintain independent
// windows, which is appropriate for this low-volume form and keeps no PII.
function webLeadRateLimit(req, res, next) {
  const now = Date.now();
  cleanupExpiredAttempts(now);
  const key = req.ip || 'unknown';
  const recent = (attemptsByIp.get(key) || []).filter((time) => time > now - WINDOW_MS);
  if (recent.length >= MAX_SUBMISSIONS) {
    return res.status(429).json({ error: { message: 'Too many submissions. Please try again later.' } });
  }
  recent.push(now);
  attemptsByIp.set(key, recent);
  return next();
}

module.exports = { webLeadRateLimit };
