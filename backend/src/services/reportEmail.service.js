const crypto = require('crypto');
const env = require('../config/env');
const { getDoc, setDoc, listDocs } = require('./firestore.service');
const { buildCompanyReport, loadCompanyReportData } = require('./companyReport.service');
const { getSettings } = require('./settings.service');
const { isActiveSale } = require('../models/sale.model');
const { ApiError } = require('../middleware/errorHandler');
const { DAY_MS, businessParts, businessDayStart, businessDateKey } = require('../utils/businessTime');

const REPORT_STATE_ID = 'reportsState';

// Daily reports cover yesterday; weekly reports cover the seven days before
// today. Both end at the start of today in business time.
function reportPeriod(frequency, now = new Date()) {
  const { year, month, day } = businessParts(now);
  const to = businessDayStart(year, month, day);
  const days = frequency === 'daily' ? 1 : 7;
  const from = new Date(to.getTime() - days * DAY_MS);
  return {
    frequency,
    from,
    to,
    previousFrom: new Date(from.getTime() - days * DAY_MS),
    key: `${frequency}:${businessDateKey(from)}`,
    label: frequency === 'daily'
      ? businessDateKey(from)
      : `${businessDateKey(from)} to ${businessDateKey(new Date(to.getTime() - 1))}`,
  };
}

function shouldSendScheduledReport(reportSettings, now = new Date(), lastPeriodKey = null) {
  if (!reportSettings?.enabled) return { send: false, reason: 'Scheduled reports are turned off' };
  if (!reportSettings.recipients?.length) return { send: false, reason: 'No report recipients are configured' };
  if (reportSettings.frequency === 'weekly' && businessParts(now).weekday !== reportSettings.weekday) {
    return { send: false, reason: 'Weekly report is not due today' };
  }
  const period = reportPeriod(reportSettings.frequency, now);
  if (lastPeriodKey === period.key) return { send: false, reason: 'This period has already been sent' };
  return { send: true, period };
}

function secretMatches(provided, expected) {
  if (!expected || typeof provided !== 'string') return false;
  const left = crypto.createHash('sha256').update(provided).digest();
  const right = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(left, right);
}

function percentChange(current, previous) {
  if (!previous) return current ? null : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function topReps(sales, reps, limit = 5) {
  const names = new Map(reps.map((rep) => [rep.id, rep.name]));
  const totals = new Map();
  sales.filter(isActiveSale).forEach((sale) => {
    const entry = totals.get(sale.repId) || { repId: sale.repId, name: names.get(sale.repId) || sale.repId, count: 0, total: 0 };
    entry.count += 1;
    entry.total += Number(sale.total || 0);
    totals.set(sale.repId, entry);
  });
  return [...totals.values()]
    .map((entry) => ({ ...entry, total: Number(entry.total.toFixed(2)) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

function buildReportSummary({ period, current, previous, currentSales, reps }) {
  return {
    period: { frequency: period.frequency, label: period.label, from: period.from.toISOString(), to: period.to.toISOString() },
    sales: {
      total: current.sales.total,
      count: current.sales.count,
      previousTotal: previous.sales.total,
      changePercent: percentChange(current.sales.total, previous.sales.total),
    },
    activations: current.activations.count,
    leads: current.leads.count,
    merchandisingAudits: current.merchandisingAudits.count,
    topReps: topReps(currentSales, reps),
    topTeams: current.teamPerformance.slice(0, 5).map((team) => ({ name: team.teamName, total: team.sales.total, count: team.sales.count })),
  };
}

const ksh = (value) => `KSh ${Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function changeText(changePercent) {
  if (changePercent === null) return 'new this period';
  if (changePercent === 0) return 'no change';
  return `${changePercent > 0 ? '▲' : '▼'} ${Math.abs(changePercent)}% vs previous period`;
}

function renderReportHtml(summary, { companyName, dashboardUrl } = {}) {
  const cell = 'padding:8px 12px;border-bottom:1px solid #e1e7ec;font-size:14px;';
  const stat = (label, value, note = '') => `<td style="padding:14px;background:#f4f6f8;border-radius:8px;width:25%;vertical-align:top;"><div style="font-size:12px;color:#5d6b7e;">${escapeHtml(label)}</div><div style="font-size:20px;font-weight:700;color:#172b3a;margin-top:4px;">${escapeHtml(value)}</div>${note ? `<div style="font-size:12px;color:#5d6b7e;margin-top:4px;">${escapeHtml(note)}</div>` : ''}</td>`;
  const table = (title, rows) => `<h3 style="font-size:15px;color:#172b3a;margin:24px 0 8px;">${escapeHtml(title)}</h3>${rows.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${rows.map((row, index) => `<tr><td style="${cell}width:28px;color:#5d6b7e;">${index + 1}</td><td style="${cell}">${escapeHtml(row.name)}</td><td style="${cell}text-align:right;">${row.count} sales</td><td style="${cell}text-align:right;font-weight:600;">${ksh(row.total)}</td></tr>`).join('')}</table>`
    : '<p style="font-size:14px;color:#5d6b7e;">No sales in this period.</p>'}`;
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#eef2f5;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;"><tr><td style="padding:28px;">
<div style="font-size:12px;letter-spacing:.08em;color:#4d8b75;font-weight:700;">${escapeHtml((companyName || 'Brandsphere').toUpperCase())} · ${summary.period.frequency === 'daily' ? 'DAILY' : 'WEEKLY'} REPORT</div>
<h1 style="font-size:22px;color:#172b3a;margin:6px 0 20px;">Sales summary for ${escapeHtml(summary.period.label)}</h1>
<table role="presentation" width="100%" cellspacing="6" cellpadding="0"><tr>
${stat('Sales value', ksh(summary.sales.total), changeText(summary.sales.changePercent))}
${stat('Transactions', summary.sales.count)}
${stat('Activations', summary.activations)}
${stat('New leads', summary.leads)}
</tr></table>
${table('Top representatives', summary.topReps)}
${table('Top teams', summary.topTeams)}
<p style="font-size:13px;color:#5d6b7e;margin-top:24px;">${summary.merchandisingAudits} merchandising audits recorded. Voided sales are excluded. The attached CSV contains the same figures.</p>
${dashboardUrl ? `<p style="margin-top:20px;"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:10px 16px;background:#24445b;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px;">Open dashboard</a></p>` : ''}
</td></tr></table></body></html>`;
}

function csvValue(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function renderReportCsv(summary) {
  const rows = [
    ['Section', 'Name', 'Sales count', 'Value (KSh)'],
    ['Period', summary.period.label, '', ''],
    ['Total', 'All sales', summary.sales.count, summary.sales.total],
    ['Total', 'Previous period', '', summary.sales.previousTotal],
    ['Total', 'Activations', summary.activations, ''],
    ['Total', 'New leads', summary.leads, ''],
    ['Total', 'Merchandising audits', summary.merchandisingAudits, ''],
    ...summary.topReps.map((rep) => ['Top representative', rep.name, rep.count, rep.total]),
    ...summary.topTeams.map((team) => ['Top team', team.name, team.count, team.total]),
  ];
  return rows.map((row) => row.map(csvValue).join(',')).join('\n');
}

async function buildScheduledReport(period) {
  const [current, previous, reps] = await Promise.all([
    loadCompanyReportData(period.from, new Date(period.to.getTime() - 1)),
    loadCompanyReportData(period.previousFrom, new Date(period.from.getTime() - 1)),
    listDocs('reps'),
  ]);
  const range = (from, to) => ({ from: from.getTime(), to: to.getTime() - 1 });
  return buildReportSummary({
    period,
    current: buildCompanyReport({ ...current, ...range(period.from, period.to) }),
    previous: buildCompanyReport({ ...previous, ...range(period.previousFrom, period.from) }),
    currentSales: current.sales,
    reps,
  });
}

async function sendEmail({ to, subject, html, attachments }) {
  if (!env.resendApiKey || !env.reportEmailFrom) {
    throw new ApiError(503, 'Report emails are not configured. Set RESEND_API_KEY and REPORT_EMAIL_FROM on the server.');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.reportEmailFrom, to, subject, html, attachments }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(502, `The email service rejected the report (${response.status}): ${body.slice(0, 200)}`);
  }
  return response.json();
}

async function sendReport({ recipients, period, settings }) {
  const summary = await buildScheduledReport(period);
  const companyName = settings.companyName;
  await sendEmail({
    to: recipients,
    subject: `${companyName} ${period.frequency} report · ${period.label}`,
    html: renderReportHtml(summary, { companyName, dashboardUrl: env.dashboardUrl }),
    attachments: [{
      filename: `${companyName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${period.frequency}-report-${businessDateKey(period.from)}.csv`,
      content: Buffer.from(renderReportCsv(summary)).toString('base64'),
    }],
  });
  return summary;
}

async function runScheduledReport(now = new Date()) {
  const [settings, state] = await Promise.all([getSettings(), getDoc('settings', REPORT_STATE_ID)]);
  const decision = shouldSendScheduledReport(settings.reports, now, state?.lastPeriodKey);
  if (!decision.send) return { sent: false, reason: decision.reason };
  await sendReport({ recipients: settings.reports.recipients, period: decision.period, settings });
  await setDoc('settings', REPORT_STATE_ID, { lastPeriodKey: decision.period.key, lastSentAt: now.toISOString() });
  return { sent: true, period: decision.period.key, to: settings.reports.recipients };
}

async function sendTestReport(to) {
  const settings = await getSettings();
  const recipients = to ? [to] : settings.reports.recipients;
  if (!recipients.length) throw new ApiError(400, 'Add at least one report recipient first');
  await sendReport({ recipients, period: reportPeriod(settings.reports.frequency), settings });
  return { sent: true, to: recipients };
}

module.exports = {
  reportPeriod,
  shouldSendScheduledReport,
  secretMatches,
  percentChange,
  buildReportSummary,
  renderReportHtml,
  renderReportCsv,
  runScheduledReport,
  sendTestReport,
};
