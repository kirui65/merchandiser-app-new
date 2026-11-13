const express = require('express');
const { requireAuth, requireManager } = require('../middleware/auth.middleware');
const { loadNotifications, markNotificationsRead } = require('../services/notifications.service');

const router = express.Router();

router.use(requireAuth, requireManager);

router.get('/', async (req, res, next) => {
  try {
    return res.json(await loadNotifications(req.user.uid));
  } catch (err) {
    return next(err);
  }
});

router.post('/read', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => typeof id === 'string') : [];
    if (!ids.length) return res.status(400).json({ error: { message: 'Choose at least one notification' } });
    return res.json(await markNotificationsRead(req.user.uid, ids));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
