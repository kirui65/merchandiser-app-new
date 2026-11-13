const { createDoc } = require('./firestore.service');

function recordAudit(req, { action, entityType, entity, changedFields = [] }) {
  return createDoc('auditLog', {
    actorId: req.user.uid,
    actorRole: req.user.role,
    action,
    entityType,
    entityId: entity.id,
    entityName: entity.name || entity.sku || entity.id,
    changedFields,
  });
}

function auditMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value._seconds === 'number') return value._seconds * 1000;
  if (value && typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

// from/to are YYYY-MM-DD business dates and include the whole day.
function filterAuditEntries(entries, { actorId, entityType, entityId, action, from, to, q } = {}) {
  const fromMs = from ? new Date(`${from}T00:00:00+03:00`).getTime() : null;
  const toMs = to ? new Date(`${to}T23:59:59.999+03:00`).getTime() : null;
  const query = q ? String(q).trim().toLowerCase() : '';
  return entries.filter((entry) => {
    const time = auditMillis(entry.createdAt);
    return (!actorId || entry.actorId === actorId)
      && (!entityType || entry.entityType === entityType)
      && (!entityId || entry.entityId === entityId)
      && (!action || entry.action === action)
      && (fromMs === null || (time !== null && time >= fromMs))
      && (toMs === null || (time !== null && time <= toMs))
      && (!query || [entry.entityName, entry.action, entry.entityType, ...(entry.changedFields || [])]
        .some((value) => String(value || '').toLowerCase().includes(query)));
  }).sort((a, b) => (auditMillis(b.createdAt) || 0) - (auditMillis(a.createdAt) || 0));
}

module.exports = { recordAudit, filterAuditEntries, auditMillis };
