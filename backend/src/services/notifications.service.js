const { getDoc, listDocs, setDoc } = require('./firestore.service');
const { loadSalesInRange } = require('./companyReport.service');
const { reconcileRecords } = require('./reconciliation.service');
const { isActiveSale } = require('../models/sale.model');
const { businessParts, businessDayStart, businessMonthKey } = require('../utils/businessTime');
const logger = require('../utils/logger');

// Fraction of the business month that has passed, from 0 to 1.
function monthElapsedFraction(now = new Date()) {
  const { year, month } = businessParts(now);
  const start = businessDayStart(year, month, 1);
  const end = businessDayStart(year, month + 1, 1);
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

// A rep is behind when month-to-date sales are below the target's pro-rata share.
function repsBehindTarget({ reps, targets, sales, now = new Date() }) {
  const elapsed = monthElapsedFraction(now);
  const salesByRep = new Map();
  sales.filter(isActiveSale).forEach((sale) => {
    salesByRep.set(sale.repId, (salesByRep.get(sale.repId) || 0) + Number(sale.total || 0));
  });
  const targetByRep = new Map(targets.map((target) => [target.repId || String(target.id).split('_')[0], Number(target.amount || 0)]));
  return reps
    .filter((rep) => rep.active !== false && targetByRep.get(rep.id) > 0)
    .map((rep) => {
      const targetKsh = targetByRep.get(rep.id);
      const salesKsh = Number((salesByRep.get(rep.id) || 0).toFixed(2));
      return { repId: rep.id, name: rep.name, salesKsh, targetKsh, expectedKsh: Number((targetKsh * elapsed).toFixed(2)) };
    })
    .filter((rep) => rep.salesKsh < rep.expectedKsh);
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

// Turns raw counts into alert items, leaving out anything with nothing to do.
function buildNotificationItems({ pendingFieldRequests = 0, submittedActivations = 0, newApplicants = 0, unmatchedPayments = 0, behindTarget = [] }) {
  const items = [
    { id: 'field_requests', count: pendingFieldRequests, title: `${plural(pendingFieldRequests, 'field request')} waiting`, detail: 'Leave and field requests need a decision.', href: '/field-requests', severity: 'warning' },
    { id: 'activations', count: submittedActivations, title: `${plural(submittedActivations, 'activation')} to review`, detail: 'Submitted brand activations are awaiting approval.', href: '/activations', severity: 'warning' },
    { id: 'applicants', count: newApplicants, title: `${plural(newApplicants, 'new applicant')}`, detail: 'Applicants who have not been contacted yet.', href: '/referrals', severity: 'info' },
    { id: 'unmatched_payments', count: unmatchedPayments, title: `${plural(unmatchedPayments, 'unmatched M-Pesa payment')}`, detail: 'Payments in the last 30 days with no matching sale.', href: '/reconciliation', severity: 'critical' },
    {
      id: 'reps_behind_target',
      count: behindTarget.length,
      title: `${plural(behindTarget.length, 'rep')} behind target`,
      detail: behindTarget.slice(0, 3).map((rep) => rep.name).join(', ') + (behindTarget.length > 3 ? ` and ${behindTarget.length - 3} more` : ''),
      href: '/reps',
      severity: 'warning',
    },
  ];
  return items.filter((item) => item.count > 0).map((item) => ({ ...item, type: item.id }));
}

// Each source is loaded independently so one failure does not hide the rest.
async function safely(label, load, fallback) {
  try {
    return await load();
  } catch (err) {
    logger.error(`[notifications] ${label} failed: ${err.message}`);
    return fallback;
  }
}

async function loadNotificationItems(now = new Date()) {
  const { year, month } = businessParts(now);
  const monthStart = businessDayStart(year, month, 1);
  const paymentsFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [pendingFieldRequests, submittedActivations, newApplicants, unmatchedPayments, behindTarget] = await Promise.all([
    safely('field requests', async () => (await listDocs('fieldRequests', { where: [['status', '==', 'pending']] })).length, 0),
    safely('activations', async () => (await listDocs('activations', { where: [['status', '==', 'submitted']] })).length, 0),
    safely('applicants', async () => (await listDocs('referralRegistrations', { where: [['status', '==', 'submitted']] })).length, 0),
    safely('payments', async () => {
      const [sales, transactions] = await Promise.all([
        loadSalesInRange(paymentsFrom, now),
        listDocs('mpesaTransactions', { where: [['timestamp', '>=', paymentsFrom.toISOString()], ['timestamp', '<=', now.toISOString()]] }),
      ]);
      const completed = transactions.filter((transaction) => transaction.status === 'completed');
      return reconcileRecords(sales.filter(isActiveSale), completed).unmatchedTransactions.length;
    }, 0),
    safely('targets', async () => {
      const [reps, targets, sales] = await Promise.all([
        listDocs('reps'),
        listDocs('salesTargets', { where: [['month', '==', businessMonthKey(now)]] }),
        loadSalesInRange(monthStart, now),
      ]);
      return repsBehindTarget({ reps, targets, sales, now });
    }, []),
  ]);

  return buildNotificationItems({ pendingFieldRequests, submittedActivations, newApplicants, unmatchedPayments, behindTarget });
}

async function loadNotifications(userId, now = new Date()) {
  const [items, state] = await Promise.all([
    loadNotificationItems(now),
    getDoc('notificationStates', userId),
  ]);
  const reads = state?.reads || {};
  return {
    generatedAt: now.toISOString(),
    items: items.map((item) => ({
      ...item,
      read: Number(reads[item.id]) >= Number(item.count),
    })),
  };
}

async function markNotificationsRead(userId, ids, now = new Date()) {
  const items = await loadNotificationItems(now);
  const allowedIds = new Set(ids);
  const current = await getDoc('notificationStates', userId);
  const reads = { ...(current?.reads || {}) };
  items.filter((item) => allowedIds.has(item.id)).forEach((item) => {
    reads[item.id] = item.count;
  });
  await setDoc('notificationStates', userId, { reads, updatedAt: now.toISOString() });
  return loadNotifications(userId, now);
}

module.exports = { monthElapsedFraction, repsBehindTarget, buildNotificationItems, loadNotifications, markNotificationsRead };
