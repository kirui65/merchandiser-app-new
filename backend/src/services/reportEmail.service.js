const crypto = require('crypto');
const env = require('../config/env');
const { getDoc, setDoc, listDocs } = require('./firestore.service');
const { buildCompanyReport, loadCompanyReportData } = require('./companyReport.service');
const { getSettings } = require('./settings.service');
const { REPORT_TYPES } = require('../models/settings.model');
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

function customReportPeriod(fromDate, toDate) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(fromDate) || !datePattern.test(toDate)) {
    throw new ApiError(400, 'Report dates must use YYYY-MM-DD format');
  }
  const fromParts = fromDate.split('-').map(Number);
  const toParts = toDate.split('-').map(Number);
  const from = businessDayStart(fromParts[0], fromParts[1] - 1, fromParts[2]);
  const to = new Date(businessDayStart(toParts[0], toParts[1] - 1, toParts[2]).getTime() + DAY_MS);
  if (businessDateKey(from) !== fromDate || businessDateKey(new Date(to.getTime() - DAY_MS)) !== toDate || from >= to) {
    throw new ApiError(400, 'Choose a valid report date range');
  }
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);
  return {
    frequency: 'custom',
    from,
    to,
    previousFrom: new Date(from.getTime() - days * DAY_MS),
    key: `custom:${fromDate}:${toDate}`,
    label: fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`,
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
<div style="font-size:12px;letter-spacing:.08em;color:#4d8b75;font-weight:700;">${escapeHtml((companyName || 'Brandsphere').toUpperCase())} · ${summary.period.frequency === 'daily' ? 'DAILY' : summary.period.frequency === 'weekly' ? 'WEEKLY' : 'CUSTOM'} REPORT</div>
<h1 style="font-size:22px;color:#172b3a;margin:6px 0 20px;">Sales summary for ${escapeHtml(summary.period.label)}</h1>
<table role="presentation" width="100%" cellspacing="6" cellpadding="0"><tr>
${stat('Sales value', ksh(summary.sales.total), changeText(summary.sales.changePercent))}
${stat('Transactions', summary.sales.count)}
${stat('Activations', summary.activations)}
${stat('New leads', summary.leads)}
</tr></table>
${table('Top representatives', summary.topReps)}
${table('Top teams', summary.topTeams)}
<p style="font-size:13px;color:#5d6b7e;margin-top:24px;">${summary.merchandisingAudits} merchandising audits recorded. Voided sales are excluded. Separate PDF attachments contain the detailed reports.</p>
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

function pdfText(value) {
  return String(value ?? '')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
    .replace(/[^\x00-\x7f]/g, (character) => ({ '–': '-', '—': '-', '·': '-', '▲': '+', '▼': '-' }[character] || '?'));
}

function pdfEscape(value) {
  return pdfText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapPdfText(value, width = 94) {
  const words = pdfText(value).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!word) continue;
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function renderReportPdf(title, periodLabel, sections) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const navy = [0.09, 0.23, 0.33];
  const green = [0.45, 0.59, 0.23];
  const paleGreen = [0.94, 0.97, 0.87];
  const paleBlue = [0.94, 0.96, 0.97];
  const ink = [0.10, 0.17, 0.22];
  const muted = [0.36, 0.43, 0.47];
  const white = [1, 1, 1];
  const color = (rgb, fill = true) => rgb.join(' ') + (fill ? ' rg\n' : ' RG\n');
  const rect = (x, y, width, height, rgb) => color(rgb) + x + ' ' + y + ' ' + width + ' ' + height + ' re f\n';
  const text = (x, y, size, value, rgb = ink) => color(rgb) + 'BT\n/F1 ' + size + ' Tf\n' + x + ' ' + y + ' Td\n(' + pdfEscape(value) + ') Tj\nET\n';
  const widthsFor = (count) => {
    if (count <= 1) return [contentWidth];
    if (count === 2) return [180, contentWidth - 180];
    if (count === 3) return [145, 170, contentWidth - 315];
    if (count === 4) return [82, 178, 105, contentWidth - 365];
    if (count === 5) return [70, 135, 100, 90, contentWidth - 395];
    if (count === 6) return [72, 112, 92, 82, 72, contentWidth - 430];
    return Array.from({ length: count }, () => contentWidth / count);
  };
  const pageCommands = [];
  let commands = '';
  let y = 0;
  function startPage() {
    commands = rect(0, 0, pageWidth, pageHeight, white);
    commands += rect(0, pageHeight - 112, pageWidth, 112, navy);
    commands += rect(0, pageHeight - 116, pageWidth, 4, green);
    commands += text(margin, pageHeight - 43, 9, 'BRANDSPHERE  /  MANAGEMENT REPORT', [0.78, 0.88, 0.88]);
    commands += text(margin, pageHeight - 72, 20, title, white);
    commands += text(margin, pageHeight - 94, 9, 'Period: ' + periodLabel, [0.78, 0.88, 0.88]);
    y = pageHeight - 145;
  }
  function finishPage() {
    commands += text(margin, 24, 8, 'Generated ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', muted);
    pageCommands.push(commands);
  }
  function ensureSpace(height) {
    if (y - height < 46) {
      finishPage();
      startPage();
    }
  }
  function drawSection(section) {
    ensureSpace(32);
    commands += rect(margin, y - 21, contentWidth, 21, paleGreen);
    commands += rect(margin, y - 21, 4, 21, green);
    commands += text(margin + 13, y - 14, 10, String(section.title).toUpperCase(), navy);
    y -= 32;
    for (let rowIndex = 0; rowIndex < section.rows.length; rowIndex += 1) {
      const rawCells = Array.isArray(section.rows[rowIndex]) ? section.rows[rowIndex] : [section.rows[rowIndex]];
      const widths = widthsFor(rawCells.length);
      const cellLines = rawCells.map((cell, index) => wrapPdfText(cell, Math.max(10, Math.floor(widths[index] / 5.2))));
      const lineCount = Math.max(...cellLines.map((lines) => lines.length));
      const rowHeight = Math.max(25, lineCount * 12 + 10);
      ensureSpace(rowHeight);
      commands += rect(margin, y - rowHeight + 4, contentWidth, rowHeight, rowIndex % 2 ? paleBlue : white);
      let x = margin + 8;
      cellLines.forEach((lines, cellIndex) => {
        lines.forEach((line, lineIndex) => {
          commands += text(x, y - 12 - lineIndex * 12, 8.5, line, cellIndex === 0 ? ink : muted);
        });
        x += widths[cellIndex];
      });
      y -= rowHeight;
    }
    y -= 13;
  }
  startPage();
  sections.forEach(drawSection);
  finishPage();
  const objects = [];
  const addObject = (body) => { objects.push(body); return objects.length; };
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];
  pageCommands.forEach((pageContent) => {
    const contentId = addObject('<< /Length ' + Buffer.byteLength(pageContent, 'latin1') + ' >>\nstream\n' + pageContent + '\nendstream');
    pageIds.push(addObject('<< /Type /Page /Parent PAGES_ID 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ' + fontId + ' 0 R >> >> /Contents ' + contentId + ' 0 R >>'));
  });
  const pagesId = addObject('<< /Type /Pages /Kids [' + pageIds.map((id) => id + ' 0 R').join(' ') + '] /Count ' + pageIds.length + ' >>');
  const catalogId = addObject('<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>');
  const pdfObjects = objects.map((object) => object.replaceAll('PAGES_ID', String(pagesId)));
  let output = '%PDF-1.4\n';
  const offsets = [0];
  pdfObjects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, 'latin1'));
    output += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
  });
  const xref = Buffer.byteLength(output, 'latin1');
  output += 'xref\n0 ' + (pdfObjects.length + 1) + '\n0000000000 65535 f \n';
  for (let index = 1; index < offsets.length; index += 1) output += String(offsets[index]).padStart(10, '0') + ' 00000 n \n';
  output += 'trailer\n<< /Size ' + (pdfObjects.length + 1) + ' /Root ' + catalogId + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return Buffer.from(output, 'latin1');
}

// Legacy text renderer retained for compatibility with older callers.
function renderLegacyReportPdf(title, periodLabel, sections) {
  const lines = [
    'BRANDSPHERE MANAGEMENT REPORT',
    title,
    `Period: ${periodLabel}`,
    `Generated: ${new Date().toISOString()}`,
    '',
  ];
  for (const section of sections) {
    lines.push(section.title.toUpperCase());
    for (const row of section.rows) {
      const text = Array.isArray(row) ? row.join(' | ') : row;
      lines.push(...wrapPdfText(text));
    }
    lines.push('');
  }

  const pages = [];
  for (let index = 0; index < lines.length; index += 48) pages.push(lines.slice(index, index + 48));
  const objects = [];
  const addObject = (body) => { objects.push(body); return objects.length; };
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];
  for (const pageLines of pages) {
    let commands = 'BT\n/F1 10 Tf\n50 790 Td\n';
    pageLines.forEach((line, lineIndex) => {
      const size = lineIndex === 0 ? 14 : lineIndex === 1 ? 12 : 10;
      if (lineIndex === 0) commands += `/F1 ${size} Tf\n`;
      if (lineIndex === 1) commands += `/F1 ${size} Tf\n`;
      if (lineIndex > 1 && line === line.toUpperCase() && line.length > 2) commands += `/F1 10 Tf\n`;
      commands += `(${pdfEscape(line)}) Tj\n0 -15 Td\n`;
    });
    commands += 'ET';
    const contentId = addObject(`<< /Length ${Buffer.byteLength(commands, 'latin1')} >>\nstream\n${commands}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent PAGES_ID 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  const pagesId = addObject(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const pdfObjects = objects.map((object) => object.replaceAll('PAGES_ID', String(pagesId)));
  let output = '%PDF-1.4\n';
  const offsets = [0];
  pdfObjects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, 'latin1'));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output, 'latin1');
  output += `xref\n0 ${pdfObjects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${pdfObjects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, 'latin1');
}

function valueDate(value) {
  if (value && typeof value.toDate === 'function') return value.toDate();
  if (value && typeof value.toMillis === 'function') return new Date(value.toMillis());
  if (value && typeof value._seconds === 'number') return new Date(value._seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function inPeriod(record, field, period) {
  const date = valueDate(record[field]);
  return date && date >= period.from && date < period.to;
}

function reportFileName(value) {
  return pdfText(value).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'brandsphere';
}

function buildPdfAttachments(reportPackage, settings) {
  const { period, summary, current, referrals, calls, names } = reportPackage;
  const { reps, outlets, products } = names;
  const repName = (id) => reps.get(id) || id || 'Unassigned';
  const outletName = (id) => outlets.get(id) || id || 'Unknown outlet';
  const productName = (id) => products.get(id) || id || 'Unknown product';
  const filePrefix = reportFileName(settings.companyName);
  const selectedReports = new Set(settings.reports?.includedReports?.length ? settings.reports.includedReports : REPORT_TYPES);
  const attachment = (reportType, slug, title, sections) => ({
    reportType,
    filename: `${filePrefix}-${slug}-${businessDateKey(period.from)}.pdf`,
    content: renderReportPdf(title, period.label, sections).toString('base64'),
  });
  const activeSales = current.sales.filter(isActiveSale);
  const activeReferrals = referrals.filter((referral) => inPeriod(referral, 'createdAt', period));
  const activeLeads = current.leads;
  const fieldRows = [
    ['Activations', current.activations.length, `Footfall: ${current.activations.reduce((sum, item) => sum + Number(item.footfallCount || 0), 0)}`],
    ['Merchandising audits', current.audits.length, `Low-stock flags: ${current.audits.reduce((sum, item) => sum + (item.stockChecks || []).filter((check) => check.lowStock).length, 0)}`],
  ];
  return [
    attachment('summary', 'summary-report', 'Executive summary', [{
      title: 'Key metrics',
      rows: [
        ['Sales value', ksh(summary.sales.total), changeText(summary.sales.changePercent)],
        ['Sales transactions', summary.sales.count],
        ['Activations', summary.activations],
        ['Leads', summary.leads],
        ['Referral applicants', activeReferrals.length],
        ['Merchandising audits', summary.merchandisingAudits],
      ],
    }, {
      title: 'Top representatives',
      rows: summary.topReps.map((rep, index) => [`${index + 1}. ${rep.name}`, `${rep.count} sales`, ksh(rep.total)]),
    }, {
      title: 'Top teams',
      rows: summary.topTeams.map((team, index) => [`${index + 1}. ${team.name}`, `${team.count} sales`, ksh(team.total)]),
    }]),
    attachment('sales', 'sales-report', 'Sales report', [{
      title: `Transactions (${activeSales.length})`,
      rows: activeSales.length
        ? activeSales.map((sale) => [valueDate(sale.timestamp)?.toISOString().slice(0, 16) || 'Unknown date', repName(sale.repId), outletName(sale.outletId), productName(sale.productId), `Qty ${sale.qty}`, ksh(sale.total)])
        : ['No active sales recorded in this period.'],
    }]),
    attachment('leads', 'leads-report', 'Leads report', [{
      title: `Lead pipeline (${activeLeads.length})`,
      rows: activeLeads.length
        ? activeLeads.map((lead) => [valueDate(lead.createdAt)?.toISOString().slice(0, 16) || 'Unknown date', lead.name, lead.organization || '', lead.status, lead.score || 'unscored', lead.source || ''])
        : ['No leads recorded in this period.'],
    }]),
    attachment('referrals', 'referral-applicants-report', 'Referral applicants report', [{
      title: `Applicants (${activeReferrals.length})`,
      rows: activeReferrals.length
        ? activeReferrals.map((referral) => [valueDate(referral.createdAt)?.toISOString().slice(0, 16) || 'Unknown date', referral.applicantName, referral.phone, referral.email, referral.county, referral.status, referral.source || ''])
        : ['No referral applicants recorded in this period.'],
    }]),
    attachment('field_activity', 'field-activity-report', 'Field activity report', [{
      title: 'Activity totals',
      rows: fieldRows,
    }, {
      title: `Calls logged (${calls.length})`,
      rows: calls.length ? calls.map((call) => [valueDate(call.startedAt)?.toISOString().slice(0, 16) || 'Unknown date', call.outcome || call.status || 'call', call.telemarketerId || 'Unassigned', call.leadId || '']) : ['No calls recorded in this period.'],
    }]),
  ].filter((attachmentItem) => selectedReports.has(attachmentItem.reportType))
    .map(({ reportType, ...attachmentItem }) => attachmentItem);
}

async function buildScheduledReport(period) {
  const [current, previous, reps, referrals, calls, outlets, products] = await Promise.all([
    loadCompanyReportData(period.from, new Date(period.to.getTime() - 1)),
    loadCompanyReportData(period.previousFrom, new Date(period.from.getTime() - 1)),
    listDocs('reps'),
    listDocs('referralRegistrations'),
    listDocs('calls'),
    listDocs('outlets'),
    listDocs('products'),
  ]);
  const range = (from, to) => ({ from: from.getTime(), to: to.getTime() - 1 });
  const summary = buildReportSummary({
    period,
    current: buildCompanyReport({ ...current, ...range(period.from, period.to) }),
    previous: buildCompanyReport({ ...previous, ...range(period.previousFrom, period.from) }),
    currentSales: current.sales,
    reps,
  });
  return {
    period,
    summary,
    current: {
      ...current,
      leads: current.leads.filter((lead) => inPeriod(lead, 'createdAt', period)),
      activations: current.activations.filter((activation) => inPeriod(activation, 'startedAt', period)),
      audits: current.audits.filter((audit) => inPeriod(audit, 'observedAt', period)),
    },
    referrals,
    calls: calls.filter((call) => inPeriod(call, 'startedAt', period)),
    names: {
      reps: new Map(reps.map((rep) => [rep.id, rep.name])),
      outlets: new Map(outlets.map((outlet) => [outlet.id, outlet.name])),
      products: new Map(products.map((product) => [product.id, product.name])),
    },
  };
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
  const reportPackage = await buildScheduledReport(period);
  const summary = reportPackage.summary;
  const companyName = settings.companyName;
  await sendEmail({
    to: recipients,
    subject: `${companyName} ${period.frequency} management reports · ${period.label}`,
    html: renderReportHtml(summary, { companyName, dashboardUrl: env.dashboardUrl })
      .replace('The attached CSV contains the same figures.', 'Separate PDF attachments include the summary, sales, leads, referral applicants, and field activity reports.'),
    attachments: buildPdfAttachments(reportPackage, settings),
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

async function sendTestReport(to, range = null) {
  const settings = await getSettings();
  const recipients = to ? [to] : settings.reports.recipients;
  if (!recipients.length) throw new ApiError(400, 'Add at least one report recipient first');
  const period = range?.from && range?.to
    ? customReportPeriod(range.from, range.to)
    : reportPeriod(settings.reports.frequency);
  await sendReport({ recipients, period, settings });
  return { sent: true, to: recipients };
}

module.exports = {
  reportPeriod,
  customReportPeriod,
  shouldSendScheduledReport,
  secretMatches,
  percentChange,
  buildReportSummary,
  renderReportHtml,
  renderReportCsv,
  renderReportPdf,
  runScheduledReport,
  sendTestReport,
};
