const express = require('express');
const { requireAuth, requireManager } = require('../middleware/auth.middleware');
const { listDocs, getDoc } = require('../services/firestore.service');
const { recordAudit, filterAuditEntries } = require('../services/audit.service');
const { ApiError } = require('../middleware/errorHandler');

const router = express.Router();

router.use(requireAuth, requireManager);

router.get('/', async (req, res, next) => {
  try {
    const filters = Object.fromEntries(['actorId', 'entityType', 'entityId', 'action', 'from', 'to', 'q']
      .map((key) => [key, typeof req.query[key] === 'string' ? req.query[key].slice(0, 200) : undefined]));
    if ([filters.from, filters.to].some((value) => value && !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
      throw new ApiError(400, 'Dates must be YYYY-MM-DD');
    }
    // One record's history uses an equality query (no composite index needed);
    // everything else filters the latest 500 entries.
    const source = filters.entityId
      ? await listDocs('auditLog', { where: [['entityId', '==', filters.entityId]], limit: 500 })
      : await listDocs('auditLog', { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 500 });
    const entries = filterAuditEntries(source, filters);
    const actorIds = [...new Set(source.map((entry) => entry.actorId).filter(Boolean))];
    const actors = (await Promise.all(actorIds.map((id) => getDoc('reps', id))))
      .filter(Boolean)
      .map((rep) => ({ id: rep.id, name: rep.name, role: rep.role }));
    return res.json({ entries, actors });
  } catch (err) {
    return next(err);
  }
});

router.post('/events', async (req, res, next) => {
  try {
    if (req.body?.event !== 'dashboard_export' || !['csv', 'print'].includes(req.body?.format)) throw new ApiError(400, 'A valid dashboard export event is required');
    await recordAudit(req, { action: 'exported', entityType: 'dashboard', entity: { id: 'dashboard', name: 'Sales dashboard' }, changedFields: [req.body.format, ...(req.body.range ? ['date_range'] : [])] });
    return res.status(201).json({ recorded: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
