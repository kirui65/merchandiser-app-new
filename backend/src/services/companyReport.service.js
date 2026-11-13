const { admin } = require('../config/firebase');
const { listDocs } = require('./firestore.service');
const { isActiveSale } = require('../models/sale.model');

// Sales timestamps are stored as ISO strings, epoch milliseconds or Firestore
// timestamps depending on the client version, so all three are queried.
async function loadSalesInRange(from, to) {
  const salesByType = await Promise.all([
    listDocs('sales', { where: [['timestamp', '>=', from.toISOString()], ['timestamp', '<=', to.toISOString()]] }),
    listDocs('sales', { where: [['timestamp', '>=', from.getTime()], ['timestamp', '<=', to.getTime()]] }),
    listDocs('sales', { where: [['timestamp', '>=', admin.firestore.Timestamp.fromDate(from)], ['timestamp', '<=', admin.firestore.Timestamp.fromDate(to)]] }),
  ]);
  return [...new Map(salesByType.flat().map((sale) => [sale.id, sale])).values()];
}

async function loadCompanyReportData(from, to) {
  const fromTimestamp = admin.firestore.Timestamp.fromDate(from);
  const toTimestamp = admin.firestore.Timestamp.fromDate(to);
  const [teams, sales, activations, leads, audits] = await Promise.all([
    listDocs('teams'),
    loadSalesInRange(from, to),
    listDocs('activations', { where: [['startedAt', '>=', fromTimestamp], ['startedAt', '<=', toTimestamp]] }),
    listDocs('leads', { where: [['createdAt', '>=', fromTimestamp], ['createdAt', '<=', toTimestamp]] }),
    listDocs('merchandisingAudits', { where: [['observedAt', '>=', fromTimestamp], ['observedAt', '<=', toTimestamp]] }),
  ]);
  return { teams, sales, activations, leads, audits };
}

function timestampMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value._seconds === 'number') return value._seconds * 1000;
  if (typeof value === 'number') return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildCompanyReport({ sales, activations, leads, audits, teams, from, to, campaignId, regionId }) {
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const matches = (record, dateValue) => {
    const time = timestampMillis(dateValue);
    return Number.isFinite(time)
      && time >= from
      && time <= to
      && (!campaignId || record.campaignId === campaignId)
      && (!regionId || teamById.get(record.teamId)?.regionId === regionId);
  };
  const filteredSales = sales.filter((record) => isActiveSale(record) && matches(record, record.timestamp));
  const filteredActivations = activations.filter((record) => matches(record, record.startedAt));
  const filteredLeads = leads.filter((record) => matches(record, record.createdAt));
  const filteredAudits = audits.filter((record) => matches(record, record.observedAt));
  const teamPerformanceById = new Map();
  const teamStats = (teamId) => {
    if (!teamPerformanceById.has(teamId)) {
      const team = teamById.get(teamId);
      teamPerformanceById.set(teamId, {
        teamId,
        teamName: team?.name || teamId,
        sales: { count: 0, total: 0 },
        activations: 0,
        leads: 0,
        merchandisingAudits: 0,
      });
    }
    return teamPerformanceById.get(teamId);
  };
  filteredSales.forEach((record) => {
    if (!record.teamId) return;
    const stats = teamStats(record.teamId);
    stats.sales.count += 1;
    stats.sales.total += Number(record.total || 0);
  });
  filteredActivations.forEach((record) => { if (record.teamId) teamStats(record.teamId).activations += 1; });
  filteredLeads.forEach((record) => { if (record.teamId) teamStats(record.teamId).leads += 1; });
  filteredAudits.forEach((record) => { if (record.teamId) teamStats(record.teamId).merchandisingAudits += 1; });
  const teamPerformance = [...teamPerformanceById.values()]
    .map((team) => ({ ...team, sales: { ...team.sales, total: Number(team.sales.total.toFixed(2)) } }))
    .sort((a, b) => b.sales.total - a.sales.total || b.activations - a.activations || a.teamName.localeCompare(b.teamName));

  return {
    sales: {
      count: filteredSales.length,
      total: Number(filteredSales.reduce((sum, record) => sum + Number(record.total || 0), 0).toFixed(2)),
    },
    activations: {
      count: filteredActivations.length,
      footfallCount: filteredActivations.reduce((sum, record) => sum + Number(record.footfallCount || 0), 0),
    },
    leads: {
      count: filteredLeads.length,
      byStatus: Object.fromEntries(['new', 'contacted', 'qualified', 'converted', 'not_interested', 'closed']
        .map((status) => [status, filteredLeads.filter((lead) => lead.status === status).length])),
    },
    merchandisingAudits: {
      count: filteredAudits.length,
      lowStockChecks: filteredAudits.reduce((sum, record) => sum
        + (record.stockChecks || []).filter((check) => check.lowStock).length, 0),
      compliantPlanograms: filteredAudits.filter((record) => record.planogram?.compliant === true).length,
    },
    teamPerformance,
  };
}

module.exports = { buildCompanyReport, loadSalesInRange, loadCompanyReportData };
