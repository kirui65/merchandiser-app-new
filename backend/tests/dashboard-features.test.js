const test = require('node:test');
const assert = require('node:assert/strict');
const { SettingsSchema, SettingsUpdateSchema, withDefaults } = require('../src/models/settings.model');
const { reportPeriod, shouldSendScheduledReport, secretMatches, percentChange, renderReportHtml, renderReportCsv } = require('../src/services/reportEmail.service');
const { filterAuditEntries } = require('../src/services/audit.service');
const { monthElapsedFraction, repsBehindTarget, buildNotificationItems } = require('../src/services/notifications.service');
const { monthToDate } = require('../src/services/recordOverview.service');

test('settings fill in defaults and accept valid partial updates', () => {
  const settings = withDefaults({ companyName: 'Acme', reports: { enabled: true } });
  assert.equal(settings.companyName, 'Acme');
  assert.deepEqual(settings.reports, { enabled: true, frequency: 'weekly', weekday: 1, recipients: [] });
  assert.equal(SettingsSchema.safeParse(settings).success, true);
  const update = SettingsUpdateSchema.parse({ workWeekDays: [5, 1, 1], reports: { recipients: ['Boss@Example.com '] } });
  assert.deepEqual(update.workWeekDays, [1, 5]);
  assert.deepEqual(update.reports.recipients, ['boss@example.com']);
});

test('settings reject empty updates and invalid values', () => {
  assert.equal(SettingsUpdateSchema.safeParse({}).success, false);
  assert.equal(SettingsUpdateSchema.safeParse({ defaultMonthlyTargetKsh: -1 }).success, false);
  assert.equal(SettingsUpdateSchema.safeParse({ workWeekDays: [7] }).success, false);
  assert.equal(SettingsUpdateSchema.safeParse({ reports: { recipients: ['not-an-email'] } }).success, false);
  assert.equal(SettingsUpdateSchema.safeParse({ reports: { frequency: 'monthly' } }).success, false);
});

test('report periods end at the start of the Nairobi business day', () => {
  // 2026-11-16 01:00 Nairobi is still 2026-11-15 22:00 UTC.
  const now = new Date('2026-11-15T22:00:00.000Z');
  const daily = reportPeriod('daily', now);
  assert.equal(daily.from.toISOString(), '2026-11-14T21:00:00.000Z');
  assert.equal(daily.to.toISOString(), '2026-11-15T21:00:00.000Z');
  assert.equal(daily.key, 'daily:2026-11-15');
  const weekly = reportPeriod('weekly', now);
  assert.equal(weekly.from.toISOString(), '2026-11-08T21:00:00.000Z');
  assert.equal(weekly.previousFrom.toISOString(), '2026-11-01T21:00:00.000Z');
  assert.equal(weekly.label, '2026-11-09 to 2026-11-15');
});

test('scheduled reports send only when enabled, due, and not already sent', () => {
  const monday = new Date('2026-11-16T05:00:00.000Z');
  const weekly = { enabled: true, frequency: 'weekly', weekday: 1, recipients: ['a@b.co'] };
  assert.equal(shouldSendScheduledReport({ ...weekly, enabled: false }, monday).send, false);
  assert.equal(shouldSendScheduledReport({ ...weekly, recipients: [] }, monday).send, false);
  assert.equal(shouldSendScheduledReport({ ...weekly, weekday: 2 }, monday).send, false);
  const due = shouldSendScheduledReport(weekly, monday);
  assert.equal(due.send, true);
  assert.equal(shouldSendScheduledReport(weekly, monday, due.period.key).send, false);
  assert.equal(shouldSendScheduledReport({ ...weekly, frequency: 'daily', weekday: 3 }, monday).send, true);
});

test('scheduler secret comparison requires an exact configured match', () => {
  assert.equal(secretMatches('s3cret', 's3cret'), true);
  assert.equal(secretMatches('s3cret ', 's3cret'), false);
  assert.equal(secretMatches(undefined, 's3cret'), false);
  assert.equal(secretMatches('anything', undefined), false);
});

test('report email escapes names and reports percentage change', () => {
  assert.equal(percentChange(150, 100), 50);
  assert.equal(percentChange(0, 0), 0);
  assert.equal(percentChange(10, 0), null);
  const summary = {
    period: { frequency: 'weekly', label: '2026-11-09 to 2026-11-15' },
    sales: { total: 1500, count: 3, previousTotal: 1000, changePercent: 50 },
    activations: 2, leads: 1, merchandisingAudits: 4,
    topReps: [{ name: '<b>Amina</b>, "A"', count: 3, total: 1500 }],
    topTeams: [],
  };
  const html = renderReportHtml(summary, { companyName: 'Acme' });
  assert.ok(html.includes('&lt;b&gt;Amina&lt;/b&gt;'));
  assert.ok(html.includes('▲ 50% vs previous period'));
  assert.ok(renderReportCsv(summary).includes('"<b>Amina</b>, ""A"""'));
});

test('audit filters match actor, entity, action, text and inclusive business dates', () => {
  const entries = [
    { id: '1', actorId: 'm1', entityType: 'rep', entityId: 'r1', entityName: 'Amina', action: 'updated', changedFields: ['phone'], createdAt: '2026-11-10T20:59:00.000Z' },
    { id: '2', actorId: 'm2', entityType: 'outlet', entityId: 'o1', entityName: 'Duka', action: 'created', changedFields: [], createdAt: '2026-11-10T21:01:00.000Z' },
    { id: '3', actorId: 'm1', entityType: 'rep', entityId: 'r2', entityName: 'Brian', action: 'deleted', createdAt: { _seconds: Date.parse('2026-11-12T09:00:00.000Z') / 1000 } },
  ];
  assert.deepEqual(filterAuditEntries(entries, { actorId: 'm1' }).map((e) => e.id), ['3', '1']);
  assert.deepEqual(filterAuditEntries(entries, { from: '2026-11-11', to: '2026-11-11' }).map((e) => e.id), ['2']);
  assert.deepEqual(filterAuditEntries(entries, { q: 'PHONE' }).map((e) => e.id), ['1']);
  assert.deepEqual(filterAuditEntries(entries, { entityType: 'rep', action: 'deleted' }).map((e) => e.id), ['3']);
  assert.deepEqual(filterAuditEntries(entries, { entityId: 'o1' }).map((e) => e.id), ['2']);
});

test('reps are behind target when sales trail the pro-rata month pace', () => {
  const now = new Date('2026-11-15T21:00:00.000Z'); // start of 16 Nov in Nairobi: 15 of 30 days
  assert.equal(monthElapsedFraction(now), 0.5);
  const behind = repsBehindTarget({
    now,
    reps: [{ id: 'a', name: 'Amina' }, { id: 'b', name: 'Brian' }, { id: 'c', name: 'Chebet', active: false }, { id: 'd', name: 'No target' }],
    targets: [{ repId: 'a', amount: 1000 }, { id: 'b_2026-11', amount: 1000 }, { repId: 'c', amount: 1000 }],
    sales: [
      { repId: 'a', total: 600 },
      { repId: 'b', total: 400 },
      { repId: 'b', total: 500, saleStatus: 'voided' },
    ],
  });
  assert.deepEqual(behind.map((rep) => [rep.repId, rep.salesKsh, rep.expectedKsh]), [['b', 400, 500]]);
});

test('alerts omit empty categories and summarise reps behind target', () => {
  const items = buildNotificationItems({
    pendingFieldRequests: 1,
    newApplicants: 0,
    behindTarget: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
  });
  assert.deepEqual(items.map((item) => item.id), ['field_requests', 'reps_behind_target']);
  assert.equal(items[0].title, '1 field request waiting');
  assert.equal(items[1].detail, 'A, B, C and 1 more');
  assert.equal(items[1].href, '/reps');
});

test('rep overview month-to-date excludes voided and other-month sales', () => {
  const now = new Date('2026-11-20T10:00:00.000Z');
  const summary = monthToDate([
    { total: 100, timestamp: '2026-11-02T10:00:00.000Z' },
    { total: 50, timestamp: Date.parse('2026-10-31T22:00:00.000Z') }, // 1 Nov in Nairobi
    { total: 70, timestamp: '2026-10-31T20:00:00.000Z' }, // 31 Oct in Nairobi
    { total: 999, timestamp: '2026-11-03T10:00:00.000Z', saleStatus: 'voided' },
  ], { amount: 600 }, now);
  assert.deepEqual(summary, { month: '2026-11', salesKsh: 150, salesCount: 2, targetKsh: 600, progressPercent: 25 });
});
