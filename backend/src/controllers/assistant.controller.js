const { askAssistant } = require('../services/assistant.service');

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

module.exports = { chat };
