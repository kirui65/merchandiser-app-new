const env = require('../config/env');
const { ApiError } = require('../middleware/errorHandler');
const { listDocs } = require('./firestore.service');
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

function buildSystemPrompt(report, range) {
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

The manager's question will be provided as the next user message.`;
}

function countBy(records, field) {
  return records.reduce((counts, record) => {
    const value = record[field] || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function sum(records, field) {
  return Number(records.reduce((total, record) => total + Number(record[field] || 0), 0).toFixed(2));
}

async function loadAssistantContext() {
  const collections = [
    'referralRegistrations', 'campaigns', 'leads', 'calls', 'sales', 'mpesaTransactions',
    'activations', 'merchandisingAudits', 'routes', 'outlets', 'products', 'reps',
    'teams', 'regions', 'territories', 'fieldRequests', 'broadcasts', 'competitorPrices',
    'outletOnboarding', 'salesTargets',
  ];
  const records = await Promise.all(collections.map((collection) => listDocs(collection)));
  const data = Object.fromEntries(collections.map((collection, index) => [collection, records[index]]));
  const referrals = data.referralRegistrations;
  const campaigns = data.campaigns;
  const leads = data.leads;
  const calls = data.calls;
  const sales = data.sales;
  const transactions = data.mpesaTransactions;
  const reps = data.reps;

  return {
    applicants: {
      total: referrals.length,
      byStatus: countBy(referrals, 'status'),
      bySource: countBy(referrals, 'source'),
      byCampaign: countBy(referrals, 'campaignId'),
      byCounty: countBy(referrals, 'county'),
      byEducation: countBy(referrals, 'education'),
      paidNitaFees: referrals.filter((item) => item.nitaFeeStatus === 'paid').length,
      withPassports: referrals.filter((item) => item.passportStatus === 'has_passport').length,
    },
    campaigns: {
      total: campaigns.length,
      active: campaigns.filter((item) => item.status === 'active').length,
      byStatus: countBy(campaigns, 'status'),
      byProgramType: countBy(campaigns, 'programType'),
      names: campaigns.map((item) => ({ id: item.id, name: item.name, status: item.status, programType: item.programType })),
    },
    leads: { total: leads.length, byStatus: countBy(leads, 'status'), byScore: countBy(leads, 'score') },
    calls: { total: calls.length, byOutcome: countBy(calls, 'outcome') },
    sales: { totalTransactions: sales.length, totalRevenueKsh: sum(sales, 'total'), byProduct: countBy(sales, 'productId') },
    payments: { total: transactions.length, byStatus: countBy(transactions, 'status'), completedValueKsh: sum(transactions.filter((item) => item.status === 'completed'), 'amount') },
    fieldActivity: {
      activations: data.activations.length,
      merchandisingAudits: data.merchandisingAudits.length,
      routes: data.routes.length,
      competitorPriceChecks: data.competitorPrices.length,
      outletOnboardingRequests: data.outletOnboarding.length,
    },
    organization: {
      outlets: data.outlets.length,
      activeOutlets: data.outlets.filter((item) => item.active !== false).length,
      products: data.products.length,
      reps: reps.length,
      activeReps: reps.filter((item) => item.active !== false).length,
      peopleByRole: countBy(reps, 'role'),
      teams: data.teams.length,
      regions: data.regions.length,
      territories: data.territories.length,
    },
    operations: {
      fieldRequests: data.fieldRequests.length,
      broadcasts: data.broadcasts.length,
      salesTargets: data.salesTargets.length,
    },
  };
}

async function askAssistant({ message, from, to }) {
  if (!env.coarenaApiKey) throw new ApiError(503, 'The AI assistant is not configured yet');
  if (typeof message !== 'string' || !message.trim()) throw new ApiError(400, 'Enter a question for the assistant');
  if (message.trim().length > MAX_MESSAGE_LENGTH) throw new ApiError(400, `Questions must be ${MAX_MESSAGE_LENGTH} characters or fewer`);

  const range = parseDateRange(from, to);
  const [source, dashboardContext] = await Promise.all([
    loadCompanyReportData(range.from, range.to),
    loadAssistantContext(),
  ]);
  const report = {
    selectedPeriod: buildCompanyReport({
      ...source,
      from: range.from.getTime(),
      to: range.to.getTime(),
    }),
    dashboardContext,
  };
  const response = await fetch('https://coarena.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${env.coarenaApiKey}`,
    },
    body: JSON.stringify({
      model: env.coarenaModel,
      messages: [
        { role: 'system', content: buildSystemPrompt(report, range) },
        { role: 'user', content: message.trim() },
      ],
      temperature: 0.2,
      max_tokens: 700,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new ApiError(502, `The AI provider rejected the request (${response.status})`, { detail: detail.slice(0, 240) });
  }
  const payload = await response.json();
  const answer = payload.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new ApiError(502, 'The AI provider returned an empty response');
  return { answer, period: { from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10) } };
}

module.exports = { askAssistant, parseDateRange, MAX_MESSAGE_LENGTH };
