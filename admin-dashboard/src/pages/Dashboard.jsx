import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import ChartCard from '../components/ChartCard';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import { downloadCsv, exportPdf } from '../utils/export';
import {
  formatKes,
  formatNumber,
  formatDateTime,
  formatTime,
  formatWeekday,
} from '../utils/formatters';
import {
  businessDateKey,
  businessDateStartIso,
  businessDateEndIso,
  shiftDateKey,
} from '../utils/businessDate';

const today = businessDateKey();
const monthStart = `${today.slice(0, 7)}-01`;
const cash = formatKes;
function Progress({ value }) {
  const safe = Math.max(0, Number(value || 0));
  return (
    <div className="progress-wrap">
      <div className="progress-track">
        <span style={{ width: `${Math.min(safe, 100)}%` }} />
      </div>
      <strong>{Math.round(safe)}%</strong>
    </div>
  );
}
function Stat({ label, value, note, accent }) {
  return (
    <Card className={accent ? 'stat-accent' : ''}>
      <span className="muted">{label}</span>
      <div className="stat-value">{value}</div>
      {note && <small className="stat-note">{note}</small>}
    </Card>
  );
}
function toDate(value) {
  if (value?.toDate) return value.toDate();
  if (value?._seconds) return new Date(value._seconds * 1000);
  if (value?.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
}

export default function Dashboard() {
  const [range, setRange] = useState({ from: monthStart, to: today });
  const [draft, setDraft] = useState(range);
  const [totals, setTotals] = useState(null);
  const [targets, setTargets] = useState([]);
  const [reps, setReps] = useState([]);
  const [products, setProducts] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [territories, setTerritories] = useState([]);
  const [overdue, setOverdue] = useState([]);
  const [insights, setInsights] = useState(null);
  const [territoryId, setTerritoryId] = useState('');
  const [repFilter, setRepFilter] = useState('');
  const [outletFilter, setOutletFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [amounts, setAmounts] = useState({});
  const [repSearch, setRepSearch] = useState('');
  const [sortBy, setSortBy] = useState('sales');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [recruitmentSummary, setRecruitmentSummary] = useState(null);
  const [recentReferrals, setRecentReferrals] = useState([]);
  const [focus, setFocus] = useState(() => localStorage.getItem('dashboardFocus') || 'sales');
  const [autoRefresh, setAutoRefresh] = useState(
    () => localStorage.getItem('dashboardAutoRefresh') === 'true',
  );
  const [compact, setCompact] = useState(() => localStorage.getItem('dashboardCompact') === 'true');
  const [overdueDays, setOverdueDays] = useState(7);
  const [goal, setGoal] = useState(() => Number(localStorage.getItem('dashboardGoal') || 0));
  const [note, setNote] = useState(() => localStorage.getItem('dashboardNote') || '');
  const [activeView, setActiveView] = useState('overview');
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = {
      from: businessDateStartIso(range.from),
      to: businessDateEndIso(range.to),
      ...(territoryId && { territoryId }),
      ...(repFilter && { repId: repFilter }),
      ...(outletFilter && { outletId: outletFilter }),
      ...(productFilter && { productId: productFilter }),
    };
    try {
      const [a, b, c, d, e, f, g, h, i, j] = await Promise.all([
        client.get('/dashboard/totals', { params }),
        client.get('/targets', { params: { month: range.from.slice(0, 7) } }),
        client.get('/reps'),
        client.get('/products'),
        client.get('/outlets'),
        client.get('/dashboard/overdue-outlets', {
          params: {
            days: overdueDays,
            ...(territoryId && { territoryId }),
            ...(repFilter && { repId: repFilter }),
          },
        }),
        client.get('/dashboard/insights', { params }),
        client.get('/territories'),
        client.get('/referrals/summary').catch(() => ({ data: { summary: null } })),
        client.get('/referrals').catch(() => ({ data: { referrals: [] } })),
      ]);
      setTotals(a.data);
      setTargets(b.data.targets || []);
      setReps(c.data.reps || []);
      setProducts(d.data.products || []);
      setOutlets(e.data.outlets || []);
      setOverdue(f.data.overdueOutlets || []);
      setInsights(g.data);
      setTerritories(h.data.territories || []);
      setRecruitmentSummary(i.data.summary || null);
      setRecentReferrals(j.data.referrals || []);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err?.response?.data?.error?.message || 'Failed to load the dashboard.');
    } finally {
      setLoading(false);
    }
  }, [range, overdueDays, territoryId, repFilter, outletFilter, productFilter]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    localStorage.setItem('dashboardFocus', focus);
    localStorage.setItem('dashboardAutoRefresh', autoRefresh);
    localStorage.setItem('dashboardCompact', compact);
    localStorage.setItem('dashboardGoal', String(goal));
    localStorage.setItem('dashboardNote', note);
  }, [focus, autoRefresh, compact, goal, note]);
  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(load, 60000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, load]);
  const targetByRep = useMemo(
    () => Object.fromEntries(targets.map((x) => [x.repId, Number(x.amount || 0)])),
    [targets],
  );
  const productById = useMemo(() => Object.fromEntries(products.map((x) => [x.id, x])), [products]);
  const outletById = useMemo(() => Object.fromEntries(outlets.map((x) => [x.id, x])), [outlets]);
  const repRows = useMemo(
    () =>
      reps
        .filter((rep) => rep.role === 'rep')
        .map((rep) => {
          const sales = Number(totals?.byRep?.[rep.id] || 0),
            target = targetByRep[rep.id] || 0;
          return {
            ...rep,
            sales,
            target,
            progress: target ? (sales / target) * 100 : 0,
            gap: Math.max(0, target - sales),
          };
        })
        .filter(
          (x) =>
            (!repFilter || x.id === repFilter) &&
            x.name?.toLowerCase().includes(repSearch.toLowerCase()),
        )
        .sort((a, b) =>
          sortBy === 'name'
            ? a.name.localeCompare(b.name)
            : sortBy === 'progress'
              ? b.progress - a.progress
              : b.sales - a.sales,
        ),
    [reps, totals, targetByRep, repSearch, sortBy, repFilter],
  );
  const metrics = useMemo(() => {
    if (!totals) return {};
    const byDay = Object.entries(totals.byDay || {}),
      days = Math.max(
        1,
        Math.round(
          (new Date(`${range.to}T00:00:00Z`) - new Date(`${range.from}T00:00:00Z`)) / 86400000,
        ) + 1,
      ),
      best = [...byDay].sort((a, b) => b[1] - a[1])[0],
      target = Object.values(targetByRep).reduce((a, b) => a + b, 0),
      todayOfMonth = new Date().getUTCDate(),
      daysInMonth = new Date(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth() + 1,
        0,
      ).getDate();
    return {
      days,
      best,
      target,
      attainment: target ? (totals.grandTotal / target) * 100 : 0,
      average: totals.count ? totals.grandTotal / totals.count : 0,
      daily: totals.grandTotal / days,
      forecast: (totals.grandTotal / Math.max(1, todayOfMonth)) * daysInMonth,
    };
  }, [totals, range, targetByRep]);
  const productsRanked = useMemo(
    () =>
      Object.entries(totals?.byProduct || {})
        .map(([id, sales]) => ({
          id,
          name: productById[id]?.name || 'Uncatalogued product',
          sales,
        }))
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 5),
    [totals, productById],
  );
  const outletsRanked = useMemo(
    () =>
      Object.entries(totals?.byOutlet || {})
        .map(([id, sales]) => ({ id, name: outletById[id]?.name || 'Unknown outlet', sales }))
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 5),
    [totals, outletById],
  );
  const atRisk = repRows
    .filter((x) => x.target && x.progress < 60)
    .sort((a, b) => a.progress - b.progress);
  const dailyRows = useMemo(
    () =>
      Object.entries(totals?.byDay || {})
        .map(([date, sales]) => ({ date, sales, weekday: formatWeekday(`${date}T00:00:00Z`) }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [totals],
  );
  const categoryRows = useMemo(
    () =>
      Object.entries(totals?.byProduct || {})
        .reduce((list, [id, sales]) => {
          const name = productById[id]?.category || 'Uncategorised';
          const found = list.find((x) => x.name === name);
          if (found) found.sales += Number(sales);
          else list.push({ name, sales: Number(sales) });
          return list;
        }, [])
        .sort((a, b) => b.sales - a.sales),
    [totals, productById],
  );
  const activeSellers = repRows.filter((x) => x.sales > 0);
  const goalProgress = goal ? (totals?.grandTotal / goal) * 100 : 0;
  const targetCoverage = repRows.length
    ? (repRows.filter((x) => x.target > 0).length / repRows.length) * 100
    : 0;
  const monthElapsed = Math.min(
    1,
    new Date().getDate() /
      new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(),
  );
  async function saveTarget(id) {
    setSaving(id);
    try {
      await client.put(`/targets/${id}`, {
        month: range.from.slice(0, 7),
        amount: Number(amounts[id] ?? targetByRep[id] ?? 0),
      });
      await load();
    } catch (err) {
      setError(err?.response?.data?.error?.message || 'Failed to save target.');
    } finally {
      setSaving(null);
    }
  }
  function preset(kind) {
    const now = new Date();
    const from =
      kind === 'today'
        ? today
        : kind === '7d'
          ? shiftDateKey(today, -6)
          : kind === '30d'
            ? shiftDateKey(today, -29)
            : monthStart;
    const next = { from, to: today };
    setDraft(next);
    setRange(next);
  }
  async function exportDashboard(format) {
    const filename = `brandsphere-dashboard-${range.from}-${range.to}.csv`;
    const generated =
      format === 'csv'
        ? downloadCsv(filename, ['Section', 'Label', 'Value'], exportRows)
        : exportPdf('Management dashboard report', ['Section', 'Label', 'Value'], exportRows, {
            subtitle: `Reporting period ${range.from} to ${range.to}`,
          });
    if (format !== 'csv' && !(await generated)) return;
    try {
      await client.post('/audit-log/events', {
        event: 'dashboard_export',
        format,
        range: `${range.from}:${range.to}`,
      });
    } catch (err) {
      setError(
        err?.response?.data?.error?.message ||
          'The report was downloaded, but its export event could not be recorded.',
      );
    }
  }
  if (loading && !totals)
    return (
      <div
        className="dashboard-page dashboard-loading"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span className="sr-only">Loading sales overview</span>
        <header className="dashboard-compact-heading">
          <div>
            <span className="dashboard-skeleton dashboard-skeleton-label" />
            <span className="dashboard-skeleton dashboard-skeleton-title" />
            <span className="dashboard-skeleton dashboard-skeleton-copy" />
          </div>
          <div className="dashboard-skeleton-filters">
            <span className="dashboard-skeleton" />
            <span className="dashboard-skeleton" />
            <span className="dashboard-skeleton" />
            <span className="dashboard-skeleton" />
          </div>
        </header>
        <div className="stat-grid dashboard-compact-stats" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <div className="dashboard-skeleton-stat" key={index}>
              <span className="dashboard-skeleton dashboard-skeleton-label" />
              <span className="dashboard-skeleton dashboard-skeleton-value" />
              <span className="dashboard-skeleton dashboard-skeleton-copy" />
            </div>
          ))}
        </div>
        <div className="dashboard-skeleton-tabs" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div
          className="dashboard-panel-grid dashboard-overview-grid dashboard-loading-panel"
          aria-hidden="true"
        >
          <div className="dashboard-skeleton-card dashboard-skeleton-chart">
            <span className="dashboard-skeleton dashboard-skeleton-card-title" />
            <div className="dashboard-skeleton-bars">
              {[34, 58, 43, 76, 52, 88, 64].map((height, index) => (
                <span className="dashboard-skeleton" style={{ height: `${height}%` }} key={index} />
              ))}
            </div>
          </div>
          <div className="dashboard-skeleton-card dashboard-skeleton-team">
            <span className="dashboard-skeleton dashboard-skeleton-card-title" />
            {[0, 1, 2, 3].map((index) => (
              <div className="dashboard-skeleton-team-row" key={index}>
                <span className="dashboard-skeleton" />
                <span className="dashboard-skeleton" />
                <span className="dashboard-skeleton" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  if (!totals)
    return <div className="error-banner">{error || 'No dashboard data is available.'}</div>;
  const exportRows = [
    ['Summary', 'Range total', totals.grandTotal],
    ['Summary', 'Transactions', totals.count],
    ['Summary', 'Target attainment', `${Math.round(metrics.attainment)}%`],
    ['Summary', 'Forecast', metrics.forecast],
    ...Object.entries(totals.byDay || {}).map(([date, total]) => ['Daily sales', date, total]),
    ...repRows.map((x) => ['Representative', x.name, x.sales]),
  ];
  const tabs = [
    ['overview', 'Overview'],
    ['team', 'Team'],
    ['field', 'Field'],
    ['sales', 'Sales'],
    ['territories', 'Territories'],
    ['security', 'Security'],
    ['integrations', 'Integrations'],
    ['tools', 'Tools'],
  ];
  return (
    <div className={`dashboard-page ${compact ? 'is-compact' : ''}`} aria-busy={loading}>
      <header className="dashboard-compact-heading">
        <div>
          <span className="eyebrow">SALES PERFORMANCE</span>
          <h1>Sales overview</h1>
          <p className="muted">
            {range.from} to {range.to}
            {updatedAt && <span className="updated-time"> · Updated {formatTime(updatedAt)}</span>}
            {loading && (
              <span className="dashboard-refresh-status" role="status">
                <span className="dashboard-refresh-spinner" aria-hidden="true" />
                Updating
              </span>
            )}
          </p>
          {note && <p className="dashboard-saved-note">{note}</p>}
        </div>
        <div className="dashboard-heading-controls">
          <label className="dashboard-territory-filter">
            Territory
            <select value={territoryId} onChange={(event) => setTerritoryId(event.target.value)}>
              <option value="">All territories</option>
              <option value="unassigned">Unassigned</option>
              {territories.map((territory) => (
                <option key={territory.id} value={territory.id}>
                  {territory.name}
                </option>
              ))}
            </select>
          </label>
          <div className="quick-filters" aria-label="Date range">
            {[
              ['today', 'Today'],
              ['7d', '7 days'],
              ['30d', '30 days'],
              ['month', 'This month'],
            ].map(([key, label]) => (
              <button key={key} className="filter-chip" onClick={() => preset(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>
      {error && <div className="error-banner">{error}</div>}
      <div className="stat-grid dashboard-compact-stats">
        <Stat label="Sales total" value={cash(totals.grandTotal)} note={`${metrics.days} days`} />
        <Stat
          label="Transactions"
          value={formatNumber(totals.count)}
          note={`${cash(metrics.average)} average`}
        />
        <Stat label="Active reps" value={activeSellers.length} note="With sales in range" />
        <Stat
          label="vs previous period"
          value={
            insights?.comparison?.changePercent == null
              ? '—'
              : `${insights.comparison.changePercent >= 0 ? '+' : ''}${Math.round(insights.comparison.changePercent)}%`
          }
          note={insights ? `${cash(insights.comparison.previous)} previous` : 'Loading comparison'}
        />
      </div>
      <div className="dashboard-view-row">
        <span className="dashboard-view-label">Workspace view</span>
        <label className="dashboard-view-picker">
          <span className="sr-only">Choose dashboard view</span>
          <select value={activeView} onChange={(event) => setActiveView(event.target.value)}>
            {tabs.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {activeView === 'security' && (
        <div className="dashboard-security-coverage">
          <strong>
            {insights?.security?.mfaEnabledManagers || 0} /{' '}
            {insights?.security?.managerAccounts || 0}
          </strong>
          <span>active manager accounts protected by MFA</span>
          <small>Enable authenticator verification from Account settings.</small>
        </div>
      )}
      <section
        id="dashboard-panel"
        className="dashboard-panel"
        aria-label={`${tabs.find(([id]) => id === activeView)?.[1] || 'Dashboard'} dashboard view`}
      >
        {activeView === 'overview' && (
          <div className="dashboard-panel-grid dashboard-overview-grid">
            <div className="dashboard-chart">
              <ChartCard title="Sales by day" data={totals.byDay} />
            </div>
            <Card title="Recent sales" className="dashboard-panel-card">
              <div className="dashboard-compact-list">
                {insights?.recentSales?.slice(0, 5).map((sale) => (
                  <div className="dashboard-compact-row" key={sale.id}>
                    <span>
                      <strong>{sale.outletName}</strong>
                      <small>
                        {sale.repName} · {sale.productName}
                      </small>
                    </span>
                    <span className="dashboard-sale-total">{cash(sale.total)}</span>
                  </div>
                ))}
                {!insights?.recentSales?.length && <p className="muted">No sales in this range.</p>}
              </div>
              <div className="dashboard-panel-footer">
                <span className="muted">
                  {insights?.comparison?.currentCount ?? totals.count} transactions
                </span>
                <Link to="/reconciliation">Payments</Link>
              </div>
            </Card>
            {goal > 0 && (
              <Card title="Personal goal" className="dashboard-panel-card dashboard-goal-card">
                <div className="dashboard-goal-value">{Math.round(goalProgress)}%</div>
                <p className="muted">
                  {cash(totals.grandTotal)} of {cash(goal)} for this date range
                </p>
                <Progress value={goalProgress} />
                <small className="muted">
                  {cash(Math.max(0, goal - totals.grandTotal))} remaining
                </small>
              </Card>
            )}
            <Card
              title="Recruitment campaign"
              className="dashboard-panel-card dashboard-recruitment-card"
            >
              <div className="dashboard-recruitment-intro">
                <span className="dashboard-recruitment-icon" aria-hidden="true">
                  ↗
                </span>
                <span>
                  <strong>
                    {formatNumber(recruitmentSummary?.total || 0)} applicants received
                  </strong>
                  <small>Track each referral through review, training, and placement.</small>
                </span>
              </div>
              <div className="dashboard-recruitment-metrics">
                <div>
                  <strong>
                    {formatNumber(
                      (recruitmentSummary?.counts?.submitted || 0) +
                        (recruitmentSummary?.counts?.contacted || 0) +
                        (recruitmentSummary?.counts?.requirements_checked || 0) +
                        (recruitmentSummary?.counts?.training_scheduled || 0),
                    )}
                  </strong>
                  <span>In progress</span>
                </div>
                <div>
                  <strong>{formatNumber(recruitmentSummary?.counts?.placed || 0)}</strong>
                  <span>Placed</span>
                </div>
                <div>
                  <strong>{cash(recruitmentSummary?.dueKsh || 0)}</strong>
                  <span>Commission due</span>
                </div>
              </div>
              <div className="dashboard-applicant-list" aria-label="Recently received applicants">
                {recentReferrals.slice(0, 4).map((applicant) => {
                  const applicantStatus =
                    applicant.status === 'placed'
                      ? 'status-good'
                      : applicant.status === 'rejected'
                        ? 'status-risk'
                        : 'status-watch';
                  const recruiter = reps.find((rep) => rep.id === applicant.recruiterId)?.name;
                  const displayRecruiter =
                    applicant.recruiterName && applicant.recruiterName !== applicant.recruiterId
                      ? applicant.recruiterName
                      : recruiter || 'Unknown recruiter';
                  return (
                    <Link className="dashboard-applicant-row" key={applicant.id} to="/referrals">
                      <span className="dashboard-applicant-avatar" aria-hidden="true">
                        {(applicant.applicantName || 'A').trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="dashboard-applicant-copy">
                        <strong>{applicant.applicantName || 'Applicant'}</strong>
                        <small>
                          {applicant.campaignName || 'Recruitment campaign'} · {displayRecruiter}
                        </small>
                        <small>County: {applicant.county || 'Not provided'}</small>
                      </span>
                      <span className={`status-pill ${applicantStatus}`}>
                        {String(applicant.status || 'submitted').replaceAll('_', ' ')}
                      </span>
                      <time>
                        {applicant.createdAt
                          ? formatDateTime(toDate(applicant.createdAt))
                          : 'Recently'}
                      </time>
                    </Link>
                  );
                })}
                {!recentReferrals.length && (
                  <p className="dashboard-applicant-empty">
                    New applicant registrations will appear here.
                  </p>
                )}
              </div>
              <div className="dashboard-panel-footer">
                <span className="muted">
                  {cash(recruitmentSummary?.paidKsh || 0)} commission paid
                </span>
                <Link to="/referrals">Manage applicants</Link>
              </div>
            </Card>
          </div>
        )}
        {activeView === 'team' && (
          <div className="dashboard-panel-grid dashboard-single-grid">
            <Card
              title={`Team performance · ${range.from.slice(0, 7)}`}
              className="dashboard-panel-card"
            >
              <div className="dashboard-table-toolbar">
                <label>
                  Search
                  <input
                    className="control"
                    value={repSearch}
                    placeholder="Representative name"
                    onChange={(e) => setRepSearch(e.target.value)}
                  />
                </label>
                <label>
                  Sort
                  <select
                    className="control"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="sales">Sales</option>
                    <option value="progress">Target progress</option>
                    <option value="name">Name</option>
                  </select>
                </label>
                <span className="muted">{repRows.length} reps</span>
              </div>
              <div className="dashboard-table-clip">
                <table>
                  <thead>
                    <tr>
                      <th>Representative</th>
                      <th>Sales</th>
                      <th>Target</th>
                      <th>Progress</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {repRows.slice(0, 5).map((rep) => {
                      const value = amounts[rep.id] ?? (rep.target || '');
                      const status = !rep.target
                        ? 'Not set'
                        : rep.progress >= 100
                          ? 'Achieved'
                          : rep.progress >= 60
                            ? 'In progress'
                            : 'At risk';
                      return (
                        <tr key={rep.id}>
                          <td>
                            <strong>{rep.name}</strong>
                          </td>
                          <td>{cash(rep.sales)}</td>
                          <td>
                            <input
                              aria-label={`${rep.name} target`}
                              type="number"
                              min="0"
                              step="1"
                              value={value}
                              onChange={(event) =>
                                setAmounts({ ...amounts, [rep.id]: event.target.value })
                              }
                            />
                          </td>
                          <td>
                            <Progress value={rep.progress} />
                          </td>
                          <td>
                            <span
                              className={`status-pill ${rep.target ? (rep.progress >= 100 ? 'status-good' : rep.progress >= 60 ? 'status-watch' : 'status-risk') : ''}`}
                            >
                              {status}
                            </span>
                          </td>
                          <td>
                            <button
                              className="ui-button ui-button-secondary"
                              type="button"
                              disabled={saving === rep.id}
                              onClick={() => saveTarget(rep.id)}
                            >
                              {saving === rep.id ? 'Saving…' : 'Save'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="dashboard-panel-footer">
                <span className="muted">Showing the top five by {sortBy}.</span>
                <Link to="/reps">Open full team</Link>
              </div>
            </Card>
          </div>
        )}
        {activeView === 'field' && (
          <div className="dashboard-panel-grid dashboard-two-grid">
            <Card title="Target pacing and rep activity" className="dashboard-panel-card">
              <div className="dashboard-compact-list">
                {repRows.slice(0, 6).map((rep) => {
                  const activity = insights?.repActivity?.find((item) => item.id === rep.id);
                  const onPace = rep.target > 0 && rep.progress >= monthElapsed * 100;
                  return (
                    <div className="dashboard-compact-row" key={rep.id}>
                      <span>
                        <strong>{rep.name}</strong>
                        <small>
                          {rep.target
                            ? `${Math.round(rep.progress)}% of target · ${cash(rep.gap)} remaining · ${onPace ? 'On pace' : 'Behind pace'}`
                            : 'Target not set'}{' '}
                          ·{' '}
                          {activity?.lastSaleAt
                            ? `Last sale ${formatTime(activity.lastSaleAt)}`
                            : 'No sale in range'}
                        </small>
                      </span>
                      <Progress value={rep.progress} />
                    </div>
                  );
                })}
                {repRows.length === 0 && <p className="muted">No representatives found.</p>}
              </div>
              <div className="dashboard-panel-footer">
                <span className="muted">{Math.round(targetCoverage)}% have targets</span>
                <Link to="/reps">Manage team</Link>
              </div>
            </Card>
            <Card title="Visit coverage" className="dashboard-panel-card">
              <div className="dashboard-visit-count">
                <strong>{Math.round(insights?.visits?.completionPercent || 0)}%</strong>
                <span>planned visits completed</span>
              </div>
              <div className="dashboard-visit-stats">
                <span>{insights?.visits?.visited || 0} completed</span>
                <span>{insights?.visits?.planned || 0} planned</span>
              </div>
              <div className="dashboard-visit-count">
                <strong>{overdue.length}</strong>
                <span>outlets overdue for a visit</span>
              </div>
              <label className="dashboard-inline-select">
                Visit window
                <select
                  className="control"
                  value={overdueDays}
                  onChange={(event) => setOverdueDays(Number(event.target.value))}
                >
                  <option value="3">3 days</option>
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                </select>
              </label>
              <div className="dashboard-panel-footer">
                <Link to="/routes">Open route coverage</Link>
              </div>
            </Card>
          </div>
        )}
        {activeView === 'sales' && (
          <div className="dashboard-panel-grid dashboard-two-grid">
            <Card title="Payment reconciliation" className="dashboard-panel-card">
              <div className="dashboard-payment-grid">
                <div>
                  <strong>{insights?.payments?.matchedCount || 0}</strong>
                  <span>matched</span>
                </div>
                <div>
                  <strong>{insights?.payments?.pendingCount || 0}</strong>
                  <span>pending</span>
                </div>
                <div>
                  <strong>{insights?.payments?.unmatchedSales || 0}</strong>
                  <span>unmatched sales</span>
                </div>
                <div>
                  <strong>{insights?.payments?.unmatchedTransactions || 0}</strong>
                  <span>unmatched payments</span>
                </div>
              </div>
              <div className="dashboard-compact-list">
                <div className="dashboard-compact-row">
                  <strong>Unmatched sales</strong>
                  <span>{cash(insights?.payments?.unmatchedSalesTotal || 0)}</span>
                </div>
                <div className="dashboard-compact-row">
                  <strong>Unmatched payments</strong>
                  <span>{cash(insights?.payments?.unmatchedPaymentsTotal || 0)}</span>
                </div>
                <div className="dashboard-compact-row">
                  <strong>Failed payments</strong>
                  <span>{insights?.payments?.failedCount || 0}</span>
                </div>
              </div>
              <div className="dashboard-panel-footer">
                <Link to="/reconciliation">Resolve payments</Link>
              </div>
            </Card>
            <Card title="Product and outlet leaders" className="dashboard-panel-card">
              <div className="dashboard-sales-rankings">
                <div>
                  <h3>Products</h3>
                  <ol className="rank-list">
                    {productsRanked.slice(0, 3).map((item, index) => (
                      <li key={item.id}>
                        <span className="rank-number">{index + 1}</span>
                        <strong>{item.name}</strong>
                        <span>{cash(item.sales)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <h3>Outlets</h3>
                  <ol className="rank-list">
                    {outletsRanked.slice(0, 3).map((item, index) => (
                      <li key={item.id}>
                        <span className="rank-number">{index + 1}</span>
                        <strong>{item.name}</strong>
                        <span>{cash(item.sales)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
              <div className="dashboard-panel-footer">
                <Link to="/products">Products</Link>
                <Link to="/outlets">Outlets</Link>
              </div>
            </Card>
          </div>
        )}
        {activeView === 'territories' && (
          <div className="dashboard-panel-grid dashboard-single-grid">
            <Card title="Territory performance" className="dashboard-panel-card">
              <div className="dashboard-table-clip">
                <table>
                  <thead>
                    <tr>
                      <th>Territory</th>
                      <th>Sales</th>
                      <th>Share</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(insights?.territories || []).slice(0, 8).map((territory) => (
                      <tr key={territory.id}>
                        <td>
                          <strong>{territory.name}</strong>
                        </td>
                        <td>{cash(territory.total)}</td>
                        <td>
                          {Math.round(
                            (territory.total /
                              Math.max(1, insights?.comparison?.current || totals.grandTotal)) *
                              100,
                          )}
                          %
                        </td>
                        <td>
                          <button
                            className="ui-button ui-button-secondary"
                            onClick={() => setTerritoryId(territory.id)}
                          >
                            Filter
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dashboard-panel-footer">
                <span className="muted">
                  {territoryId
                    ? `Filtered by ${territoryId === 'unassigned' ? 'Unassigned' : territories.find((item) => item.id === territoryId)?.name || 'territory'}`
                    : 'All assigned territories'}
                </span>
                <Link to="/territories">Manage territories</Link>
              </div>
            </Card>
          </div>
        )}
        {activeView === 'security' && (
          <div className="dashboard-panel-grid dashboard-two-grid">
            <Card title="Security overview" className="dashboard-panel-card">
              <div className="dashboard-security-stats">
                <div>
                  <strong>
                    {insights?.security?.failedLogins || 0}
                    {insights?.security?.failedLoginsCapped ? '+' : ''}
                  </strong>
                  <span>failed logins in range</span>
                </div>
                <div>
                  <strong>{insights?.security?.inactiveAccounts || 0}</strong>
                  <span>inactive accounts</span>
                </div>
                <div>
                  <strong>{insights?.security?.managerAccounts || 0}</strong>
                  <span>active managers</span>
                </div>
              </div>
              <h3>Recent authentication events</h3>
              <div className="dashboard-compact-list">
                {insights?.security?.recentEvents?.slice(0, 4).map((event) => (
                  <div className="dashboard-compact-row" key={event.id}>
                    <span>
                      <strong>
                        {event.event === 'login_failed' ? 'Failed sign-in' : 'Successful sign-in'}
                      </strong>
                      <small>{event.email || 'Unknown account'}</small>
                    </span>
                    <span className="muted">{formatTime(toDate(event.createdAt))}</span>
                  </div>
                ))}
                {!insights?.security?.recentEvents?.length && (
                  <p className="muted">No authentication events recorded yet.</p>
                )}
              </div>
              <div className="dashboard-panel-footer">
                <span className="muted">
                  {insights?.security?.failedLoginsCapped
                    ? 'Failed-login count capped at 500.'
                    : 'No IP addresses are stored.'}
                </span>
                <Link to="/reps">Review account access</Link>
                <Link to="/audit-log">Open audit log</Link>
              </div>
            </Card>
            <Card title="Sensitive changes and route flags" className="dashboard-panel-card">
              <div className="dashboard-compact-list">
                {insights?.auditEntries?.slice(0, 4).map((entry) => (
                  <div className="dashboard-compact-row" key={entry.id}>
                    <span>
                      <strong>
                        {entry.action.replace('_', ' ')} · {entry.entityType}
                      </strong>
                      <small>
                        {entry.entityName} · {entry.changedFields?.join(', ') || 'record changed'}
                      </small>
                    </span>
                    <span className="muted">{formatTime(toDate(entry.createdAt))}</span>
                  </div>
                ))}
                {(insights?.routeAnomalies || []).slice(0, 3).map((item, index) => (
                  <div
                    className="dashboard-compact-row dashboard-review-flag"
                    key={`${item.routeId}-${index}`}
                  >
                    <span>
                      <strong>Route movement needs review</strong>
                      <small>
                        {item.repName} · {item.speedKph} km/h recorded
                      </small>
                    </span>
                    <Link to="/routes">Review</Link>
                  </div>
                ))}
                {!insights?.auditEntries?.length && !insights?.routeAnomalies?.length && (
                  <p className="muted">No recent changes or route flags.</p>
                )}
              </div>
              <div className="dashboard-panel-footer">
                <span className="muted">Flags are signals for review, not proof of spoofing.</span>
              </div>
            </Card>
          </div>
        )}
        {activeView === 'integrations' && (
          <div className="dashboard-panel-grid dashboard-two-grid">
            <Card title="Connected services" className="dashboard-panel-card">
              <div className="dashboard-compact-list">
                <div className="dashboard-compact-row">
                  <span>
                    <strong>Firestore</strong>
                    <small>Dashboard query completed successfully</small>
                  </span>
                  <span className="integration-state is-connected">Connected</span>
                </div>
                <div className="dashboard-compact-row">
                  <span>
                    <strong>M-Pesa Daraja</strong>
                    <small>
                      {insights?.integrations?.lastMpesaEvent
                        ? `Last processed callback ${formatTime(toDate(insights.integrations.lastMpesaEvent))}`
                        : 'No completed callback in this range'}
                    </small>
                  </span>
                  <span
                    className={`integration-state ${insights?.integrations?.mpesaConfigured ? 'is-configured' : 'is-unconfigured'}`}
                  >
                    {insights?.integrations?.mpesaConfigured ? 'Configured' : 'Not configured'}
                  </span>
                </div>
              </div>
              <p className="dashboard-tool-note">
                Configuration is not a live provider health check. Confirm delivery from recent
                callbacks.
              </p>
            </Card>
            <Card title="Data protection" className="dashboard-panel-card">
              <div className="dashboard-security-stats">
                <div>
                  <strong>On</strong>
                  <span>login throttling</span>
                </div>
                <div>
                  <strong>On</strong>
                  <span>session revocation</span>
                </div>
                <div>
                  <strong>
                    {insights?.security?.mfaEnabledManagers || 0}/
                    {insights?.security?.managerAccounts || 0}
                  </strong>
                  <span>manager MFA</span>
                </div>
              </div>
              <p className="dashboard-tool-note">
                Authenticator secrets are encrypted at rest. Use Account settings to enroll.
              </p>
              <Link className="dashboard-panel-link" to="/audit-log">
                Review security history
              </Link>
            </Card>
          </div>
        )}
        {activeView === 'tools' && (
          <div className="dashboard-panel-grid dashboard-tools-grid">
            <Card title="Range and reports" className="dashboard-panel-card">
              <div className="dashboard-tools-fields">
                <label>
                  From
                  <input
                    type="date"
                    value={draft.from}
                    max={draft.to}
                    onChange={(event) => setDraft({ ...draft, from: event.target.value })}
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    value={draft.to}
                    min={draft.from}
                    max={today}
                    onChange={(event) => setDraft({ ...draft, to: event.target.value })}
                  />
                </label>
              </div>
              <div className="dashboard-tool-actions">
                <button className="ui-button ui-button-primary" onClick={() => setRange(draft)}>
                  Apply range
                </button>
                <button className="ui-button ui-button-secondary" onClick={load}>
                  Refresh
                </button>
                <button
                  className="ui-button ui-button-secondary"
                  onClick={() => exportDashboard('csv')}
                >
                  Export CSV
                </button>
                <button
                  className="ui-button ui-button-secondary"
                  onClick={() => exportDashboard('pdf')}
                >
                  Export PDF
                </button>
              </div>
              <p className="dashboard-tool-note">
                Updated {updatedAt ? formatTime(updatedAt) : 'just now'}
              </p>
            </Card>
            <Card title="Filters" className="dashboard-panel-card">
              <div className="dashboard-tools-fields dashboard-filter-fields">
                <label>
                  Representative
                  <select value={repFilter} onChange={(event) => setRepFilter(event.target.value)}>
                    <option value="">All representatives</option>
                    {reps
                      .filter((rep) => rep.role === 'rep')
                      .map((rep) => (
                        <option key={rep.id} value={rep.id}>
                          {rep.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Outlet
                  <select
                    value={outletFilter}
                    onChange={(event) => setOutletFilter(event.target.value)}
                  >
                    <option value="">All outlets</option>
                    {outlets.map((outlet) => (
                      <option key={outlet.id} value={outlet.id}>
                        {outlet.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Product
                  <select
                    value={productFilter}
                    onChange={(event) => setProductFilter(event.target.value)}
                  >
                    <option value="">All products</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="ui-button ui-button-secondary"
                  onClick={() => {
                    setRepFilter('');
                    setOutletFilter('');
                    setProductFilter('');
                    setTerritoryId('');
                  }}
                >
                  Clear filters
                </button>
              </div>
            </Card>
            <Card title="Preferences" className="dashboard-panel-card">
              <div className="dashboard-tools-fields">
                <label>
                  View focus
                  <select
                    className="control"
                    value={focus}
                    onChange={(event) => {
                      setFocus(event.target.value);
                      setActiveView(
                        event.target.value === 'targets'
                          ? 'team'
                          : event.target.value === 'visits'
                            ? 'field'
                            : 'sales',
                      );
                    }}
                  >
                    <option value="sales">Sales momentum</option>
                    <option value="targets">Target delivery</option>
                    <option value="visits">Outlet coverage</option>
                  </select>
                </label>
                <label>
                  Personal goal (KES)
                  <input
                    className="control"
                    type="number"
                    min="0"
                    value={goal || ''}
                    placeholder="Optional goal"
                    onChange={(event) => setGoal(Number(event.target.value))}
                  />
                </label>
                <label className="dashboard-note-field">
                  Manager note
                  <input
                    className="control"
                    maxLength="120"
                    value={note}
                    placeholder="Add a focus note"
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
              </div>
              <div className="dashboard-tool-actions">
                <button
                  className={`toggle-button ${autoRefresh ? 'is-on' : ''}`}
                  onClick={() => setAutoRefresh(!autoRefresh)}
                >
                  {autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
                </button>
                <button
                  className={`toggle-button ${compact ? 'is-on' : ''}`}
                  onClick={() => setCompact(!compact)}
                >
                  {compact ? 'Compact rows on' : 'Compact rows off'}
                </button>
              </div>
            </Card>
            <Card title="Recent days" className="dashboard-panel-card">
              <ol className="rank-list">
                {dailyRows.slice(0, 4).map((item, index) => (
                  <li key={item.date}>
                    <span className="rank-number">{index + 1}</span>
                    <strong>{item.weekday}</strong>
                    <span>{cash(item.sales)}</span>
                  </li>
                ))}
              </ol>
              <span className="muted dashboard-date-note">
                {dailyRows[0]?.date || 'No sales recorded'}
              </span>
            </Card>
          </div>
        )}
      </section>
    </div>
  );
}
