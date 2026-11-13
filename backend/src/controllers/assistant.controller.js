const {
  askAssistant,
  listAssistantConversations,
  getAssistantConversation,
  saveAssistantConversation,
} = require('../services/assistant.service');

async function chat(req, res, next) {
  try {
    return res.json(await askAssistant({
      message: req.body?.message,
      from: req.body?.from,
      to: req.body?.to,
    }));
  } catch (err) {
    return next(err);
  }
}

async function listConversations(req, res, next) {
  try { return res.json({ conversations: await listAssistantConversations(req.user.uid) }); } catch (err) { return next(err); }
}

async function getConversation(req, res, next) {
  try { return res.json({ conversation: await getAssistantConversation(req.user.uid, req.params.id) }); } catch (err) { return next(err); }
}

async function saveConversation(req, res, next) {
  try {
    const conversation = await saveAssistantConversation(req.user.uid, {
      id: req.params.id,
      title: req.body?.title,
      messages: req.body?.messages,
    });
    return res.json({ conversation });
  } catch (err) { return next(err); }
}

module.exports = { chat, listConversations, getConversation, saveConversation };
