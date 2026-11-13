const express = require('express');
const { requireAuth, requireManager } = require('../middleware/auth.middleware');
const { validateBody } = require('../middleware/validate.middleware');
const { SettingsUpdateSchema } = require('../models/settings.model');
const { getSettings, updateSettings } = require('../services/settings.service');
const { recordAudit } = require('../services/audit.service');

const router = express.Router();

router.use(requireAuth, requireManager);

router.get('/', async (req, res, next) => {
  try {
    return res.json({ settings: await getSettings() });
  } catch (err) {
    return next(err);
  }
});

router.put('/', validateBody(SettingsUpdateSchema), async (req, res, next) => {
  try {
    const settings = await updateSettings(req.body);
    await recordAudit(req, { action: 'updated', entityType: 'settings', entity: { id: 'company', name: 'Company settings' }, changedFields: Object.keys(req.body) });
    return res.json({ settings });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
