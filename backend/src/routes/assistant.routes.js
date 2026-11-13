const express = require('express');
const { requireAuth, requireManager } = require('../middleware/auth.middleware');
const { chat, listConversations, getConversation, saveConversation } = require('../controllers/assistant.controller');

const router = express.Router();
router.use(requireAuth, requireManager);
router.post('/chat', chat);
router.get('/conversations', listConversations);
router.get('/conversations/:id', getConversation);
router.post('/conversations', saveConversation);
router.patch('/conversations/:id', saveConversation);

module.exports = router;
