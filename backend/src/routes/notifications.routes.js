const express = require('express');
const { requireAuth, requireManager } = require('../middleware/auth.middleware');
const { loadNotifications } = require('../services/notifications.service');

const router = express.Router();

router.use(requireAuth, requireManager);

router.get('/', async (req, res, next) => {
  try {
    return res.json(await loadNotifications());
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
