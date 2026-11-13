const express = require('express');
const { requireAuth, requireManager, scopeCheck } = require('../middleware/auth.middleware');
const { validateBody } = require('../middleware/validate.middleware');
const { OutletSchema, OutletUpdateSchema, OutletStatusSchema } = require('../models/outlet.model');
const { createDoc, listDocs, getDoc, updateDoc } = require('../services/firestore.service');
const { admin } = require('../config/firebase');
const { z } = require('zod');
const { ApiError } = require('../middleware/errorHandler');
const { recordAudit } = require('../services/audit.service');
const { loadOutletOverview } = require('../services/recordOverview.service');

const router = express.Router();

router.use(requireAuth);

// All authenticated users can read outlets (reps need this to log sales
// against them); only managers can create/edit.
router.get('/', async (req, res, next) => {
  try {
    const where = [];
    // A rep by default only needs their assigned outlets; managers can see all
    // or filter by ?repId=
    if (req.user.role !== 'manager') {
      where.push(['assignedRepId', '==', req.user.uid]);
    } else if (req.query.repId) {
      where.push(['assignedRepId', '==', req.query.repId]);
    }
    if (req.query.territoryId) where.push(['territoryId', '==', req.query.territoryId]);
    const outlets = await listDocs('outlets', { where });
    return res.json({ outlets });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/overview', requireManager, async (req, res, next) => {
  try {
    const overview = await loadOutletOverview(req.params.id);
    if (!overview) throw new ApiError(404, 'Outlet not found');
    return res.json(overview);
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const outlet = await getDoc('outlets', req.params.id);
    if (!outlet) throw new ApiError(404, 'Outlet not found');
    if (!scopeCheck(req.user, outlet.assignedRepId)) {
      throw new ApiError(403, 'Not authorized to view this outlet');
    }
    return res.json({ outlet });
  } catch (err) {
    return next(err);
  }
});

router.post('/', requireManager, validateBody(OutletSchema), async (req, res, next) => {
  try {
    const outlet = await createDoc('outlets', req.body);
    await recordAudit(req, { action: 'created', entityType: 'outlet', entity: outlet, changedFields: Object.keys(req.body) });
    return res.status(201).json({ outlet });
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id', requireManager, validateBody(OutletUpdateSchema), async (req, res, next) => {
  try {
    const existing = await getDoc('outlets', req.params.id);
    if (!existing) throw new ApiError(404, 'Outlet not found');
    const payload = { ...req.body };
    if (!payload.territoryId && existing.territoryId) payload.territoryId = admin.firestore.FieldValue.delete();
    const outlet = await updateDoc('outlets', req.params.id, payload);
    await recordAudit(req, { action: 'edited', entityType: 'outlet', entity: outlet, changedFields: Object.keys(req.body) });
    return res.json({ outlet });
  } catch (err) {
    return next(err);
  }
});

const BulkTerritorySchema = z.object({
  outletIds: z.array(z.string().min(1)).min(1),
  territoryId: z.string().min(1),
});

router.patch('/bulk/territory', requireManager, validateBody(BulkTerritorySchema), async (req, res, next) => {
  try {
    const territory = await getDoc('territories', req.body.territoryId);
    if (!territory) throw new ApiError(404, 'Territory not found');
    const outletIds = [...new Set(req.body.outletIds)];
    const outlets = await Promise.all(outletIds.map((id) => getDoc('outlets', id)));
    if (outlets.some((outlet) => !outlet)) throw new ApiError(404, 'One or more outlets were not found');
    await Promise.all(outletIds.map((id) => updateDoc('outlets', id, { territoryId: territory.id })));
    await Promise.all(outlets.map((outlet) => recordAudit(req, { action: 'edited', entityType: 'outlet', entity: outlet, changedFields: ['territoryId'] })));
    return res.json({ updatedCount: outletIds.length, territory });
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id/status', requireManager, validateBody(OutletStatusSchema), async (req, res, next) => {
  try {
    const existing = await getDoc('outlets', req.params.id);
    if (!existing) throw new ApiError(404, 'Outlet not found');
    const outlet = await updateDoc('outlets', req.params.id, req.body);
    await recordAudit(req, { action: outlet.active ? 'reactivated' : 'deactivated', entityType: 'outlet', entity: outlet, changedFields: ['active'] });
    return res.json({ outlet });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
