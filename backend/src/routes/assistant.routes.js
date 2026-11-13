const express = require('express');
const { requireAuth, requireManager } = require('../middleware/auth.middleware');
const { chat } = require('../controllers/assistant.controller');

const router = express.Router();
router.use(requireAuth, requireManager);
router.post('/chat', chat);

module.exports = router;
