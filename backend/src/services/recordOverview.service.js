const { getDoc, listDocs } = require('./firestore.service');
const { getActiveTeamIdForUser } = require('./teamMembership.service');
const { isActiveSale } = require('../models/sale.model');
const { businessMonthKey } = require('../utils/businessTime');
const { auditMillis } = require('./audit.service');

const RECENT_LIMIT = 10;

function newestFirst(records, field) {
  return [...records].sort((a, b) => (auditMillis(b[field]) || 0) - (auditMillis(a[field]) || 0));
}

function saleSummary(sale) {
  return {
    id: sale.id,
    timestamp: sale.timestamp,
    outletId: sale.outletId,
    outletName: sale.outletName || null,
    repId: sale.repId,
    productName: sale.productName || null,
    quantity: sale.quantity,
    total: Number(sale.total || 0),
    saleStatus: sale.saleStatus || 'active',
  };
}

// Month-to-date sales against target, using the same month key as targets.
function monthToDate(sales, target, now = new Date()) {
  const month = businessMonthKey(now);
  const monthSales = sales.filter((sale) => isActiveSale(sale) && businessMonthKey(new Date(auditMillis(sale.timestamp) || 0)) === month);
  const salesKsh = Number(monthSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0).toFixed(2));
  const targetKsh = Number(target?.amount || 0);
  return {
    month,
    salesKsh,
    salesCount: monthSales.length,
    targetKsh,
    progressPercent: targetKsh > 0 ? Number(((salesKsh / targetKsh) * 100).toFixed(1)) : null,
  };
}

function routeVisits(routes, outletNames = new Map()) {
  return routes.flatMap((route) => (route.visitedOutletIds || []).map((outletId) => ({
    date: route.date,
    repId: route.repId,
    outletId,
    outletName: outletNames.get(outletId) || null,
  })));
}

async function loadRepOverview(repId, now = new Date()) {
  const rep = await getDoc('reps', repId);
  if (!rep) return null;
  const { passwordHash, mfaSecretEncrypted, mfaSetupSecretEncrypted, ...safeRep } = rep;
  const [sales, target, routes, teamId] = await Promise.all([
    listDocs('sales', { where: [['repId', '==', repId]] }),
    getDoc('salesTargets', `${repId}_${businessMonthKey(now)}`),
    listDocs('routes', { where: [['repId', '==', repId]], orderBy: { field: 'date', direction: 'desc' }, limit: 14 }),
    getActiveTeamIdForUser(repId).catch(() => null),
  ]);
  const team = teamId ? await getDoc('teams', teamId) : null;
  const sortedSales = newestFirst(sales, 'timestamp');
  const visitedIds = [...new Set(routes.flatMap((route) => route.visitedOutletIds || []))].slice(0, 30);
  const outlets = await Promise.all(visitedIds.map((id) => getDoc('outlets', id)));
  const outletNames = new Map(outlets.filter(Boolean).map((outlet) => [outlet.id, outlet.name]));
  const lastSaleAt = sortedSales[0]?.timestamp || null;
  return {
    rep: safeRep,
    team: team ? { id: team.id, name: team.name } : null,
    monthToDate: monthToDate(sales, target, now),
    recentSales: sortedSales.slice(0, RECENT_LIMIT).map(saleSummary),
    recentVisits: routeVisits(routes, outletNames).slice(0, RECENT_LIMIT),
    lastActivityAt: lastSaleAt ? new Date(auditMillis(lastSaleAt)).toISOString() : null,
  };
}

async function loadOutletOverview(outletId) {
  const outlet = await getDoc('outlets', outletId);
  if (!outlet) return null;
  const [sales, routes, audits, assignedRep] = await Promise.all([
    listDocs('sales', { where: [['outletId', '==', outletId]] }),
    listDocs('routes', { where: [['visitedOutletIds', 'array-contains', outletId]] }),
    listDocs('merchandisingAudits', { where: [['outletId', '==', outletId]] }),
    outlet.assignedRepId ? getDoc('reps', outlet.assignedRepId) : null,
  ]);
  const visits = routeVisits([...routes].sort((a, b) => String(b.date).localeCompare(String(a.date))))
    .filter((visit) => visit.outletId === outletId);
  const repIds = [...new Set(visits.map((visit) => visit.repId))].slice(0, 20);
  const reps = await Promise.all(repIds.map((id) => getDoc('reps', id)));
  const repNames = new Map(reps.filter(Boolean).map((rep) => [rep.id, rep.name]));
  return {
    outlet,
    assignedRep: assignedRep ? { id: assignedRep.id, name: assignedRep.name } : null,
    recentSales: newestFirst(sales, 'timestamp').slice(0, RECENT_LIMIT).map(saleSummary),
    recentVisits: visits.slice(0, RECENT_LIMIT).map((visit) => ({ ...visit, repName: repNames.get(visit.repId) || null })),
    recentAudits: newestFirst(audits, 'observedAt').slice(0, 5).map((audit) => ({
      id: audit.id,
      observedAt: audit.observedAt,
      repId: audit.repId,
      planogramCompliant: audit.planogram?.compliant ?? null,
      lowStockCount: (audit.stockChecks || []).filter((check) => check.lowStock).length,
    })),
    lastVisitAt: visits[0]?.date || null,
  };
}

module.exports = { monthToDate, routeVisits, loadRepOverview, loadOutletOverview };
