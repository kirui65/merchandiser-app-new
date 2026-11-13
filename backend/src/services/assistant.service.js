const env = require('../config/env');
const { ApiError } = require('../middleware/errorHandler');
const { loadCompanyReportData, buildCompanyReport } = require('./companyReport.service');

const MAX_MESSAGE_LENGTH = 2000;

function parseDateRange(fromValue, toValue) {
  const to = toValue ? new Date(`${toValue}T23:59:59.999Z`) : new Date();
  const from = fromValue
    ? new Date(`${fromValue}T00:00:00.000Z`)
    : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
    throw new ApiError(400, 'Choose a valid assistant date range');
  }
  const days = (to.getTime() - from.getTime()) / 86400000;
  if (days > 366) throw new ApiError(400, 'Assistant date ranges cannot exceed one year');
  return { from, to };
}

function buildPrompt(message, report, range) {
  return `You are the Brandsphere management assistant. Answer the manager's question using only the supplied aggregate report context.

Rules:
- Be concise, practical, and specific. Use KSh for money.
- Do not invent figures, records, people, causes, or recommendations presented as facts.
- If the context does not answer the question, say what is missing.
- Treat all data as confidential. Never request or expose passwords, tokens, or raw personal data.
- You may calculate percentages or comparisons from the supplied figures, and label conclusions as observations.

Reporting period: ${range.from.toISOString().slice(0, 10)} to ${range.to.toISOString().slice(0, 10)}
Aggregate report context:
${JSON.stringify(report)}

Manager question:
${message}`;
}

async function askAssistant({ message, from, to }) {
  if (!env.geminiApiKey) throw new ApiError(503, 'The AI assistant is not configured yet');
  if (typeof message !== 'string' || !message.trim()) throw new ApiError(400, 'Enter a question for the assistant');
  if (message.trim().length > MAX_MESSAGE_LENGTH) throw new ApiError(400, `Questions must be ${MAX_MESSAGE_LENGTH} characters or fewer`);

  const range = parseDateRange(from, to);
  const source = await loadCompanyReportData(range.from, range.to);
  const report = buildCompanyReport({
    ...source,
    from: range.from.getTime(),
    to: range.to.getTime(),
  });
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(message.trim(), report, range) }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new ApiError(502, `The AI provider rejected the request (${response.status})`, { detail: detail.slice(0, 240) });
  }
  const payload = await response.json();
  const answer = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!answer) throw new ApiError(502, 'The AI provider returned an empty response');
  return { answer, period: { from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10) } };
}

module.exports = { askAssistant, parseDateRange, MAX_MESSAGE_LENGTH };
