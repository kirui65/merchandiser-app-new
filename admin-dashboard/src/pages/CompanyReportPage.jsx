import React, { useEffect, useState } from 'react';
import client from '../api/client';
import Button from '../components/Button';
import Card from '../components/Card';
import ChartCard from '../components/ChartCard';
import { downloadCsv, exportPdf } from '../utils/export';
import { formatKes, formatNumber } from '../utils/formatters';
import { businessDateKey, businessDateStartIso, businessDateEndIso } from '../utils/businessDate';

const today = businessDateKey();
const monthStart = `${today.slice(0, 7)}-01`;
const emptyReport = {
  sales: { count: 0, total: 0 },
  activations: { count: 0, footfallCount: 0 },
  leads: { count: 0, byStatus: {} },
  merchandisingAudits: { count: 0, lowStockChecks: 0, compliantPlanograms: 0 },
};

export default function CompanyReportPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [regions, setRegions] = useState([]);
  const [filters, setFilters] = useState({
    campaignId: '',
    regionId: '',
    from: monthStart,
    to: today,
  });
  const [appliedFilters, setAppliedFilters] = useState({
    campaignId: '',
    regionId: '',
    from: monthStart,
    to: today,
  });
  const [report, setReport] = useState(emptyReport);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([client.get('/campaigns'), client.get('/teams/regions')])
      .then(([campaignResponse, regionResponse]) => {
        setCampaigns(campaignResponse.data.campaigns || []);
        setRegions(regionResponse.data.regions || []);
      })
      .catch(() => setError('Failed to load campaign and region filters'));
  }, []);

  async function load(event) {
    event?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await client.get('/reports/company', {
        params: {
          from: businessDateStartIso(filters.from),
          to: businessDateEndIso(filters.to),
          ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
          ...(filters.regionId ? { regionId: filters.regionId } : {}),
        },
      });
      setReport(data);
      setAppliedFilters({ ...filters });
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to load company report');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function exportCsv() {
    const summary = [
      ['From', '', appliedFilters.from],
      ['To', '', appliedFilters.to],
      [
        'Campaign',
        '',
        campaigns.find((campaign) => campaign.id === appliedFilters.campaignId)?.name ||
          'All campaigns',
      ],
      [
        'Region',
        '',
        regions.find((region) => region.id === appliedFilters.regionId)?.name || 'All regions',
      ],
      ['Sales', report.sales.count, formatKes(report.sales.total)],
      ['Activations', report.activations.count, report.activations.footfallCount],
      ['Leads', report.leads.count, ''],
      [
        'Merchandising audits',
        report.merchandisingAudits.count,
        report.merchandisingAudits.lowStockChecks,
      ],
      ...Object.entries(report.leads.byStatus || {}).map(([status, count]) => [
        `Lead status: ${status}`,
        count,
        '',
      ]),
    ];
    downloadCsv('company-performance.csv', ['Metric', 'Count', 'Value'], summary);
  }

  function exportPdfReport() {
    const rows = [
      ['Reporting period', `${appliedFilters.from} to ${appliedFilters.to}`, ''],
      [
        'Campaign',
        campaigns.find((campaign) => campaign.id === appliedFilters.campaignId)?.name ||
          'All campaigns',
        '',
      ],
      [
        'Region',
        regions.find((region) => region.id === appliedFilters.regionId)?.name || 'All regions',
        '',
      ],
      ['Sales', report.sales.count, formatKes(report.sales.total)],
      [
        'Activations',
        report.activations.count,
        `${report.activations.footfallCount} consumers reached`,
      ],
      ['Leads', report.leads.count, ''],
      [
        'Merchandising audits',
        report.merchandisingAudits.count,
        `${report.merchandisingAudits.lowStockChecks} low-stock flags`,
      ],
      ...Object.entries(report.leads.byStatus || {}).map(([status, count]) => [
        `Lead status: ${status.replace(/_/g, ' ')}`,
        count,
        '',
      ]),
    ];
    exportPdf('Company performance report', ['Metric', 'Count / period', 'Value / notes'], rows, {
      subtitle: `Reporting period ${appliedFilters.from} to ${appliedFilters.to}`,
    });
  }

  const chartData = {
    'Sales transactions': report.sales.count,
    Activations: report.activations.count,
    Leads: report.leads.count,
    'Merchandising audits': report.merchandisingAudits.count,
  };

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">COMPANY PERFORMANCE</span>
        <h1>Company report</h1>
        <p className="muted">
          Cross-team activity totals. Campaign totals include only records explicitly attributed to
          that campaign.
        </p>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <Card title="Report filters">
        <form className="form-grid" onSubmit={load}>
          <div className="grid-2">
            <div className="field">
              <label>Campaign</label>
              <select
                value={filters.campaignId}
                onChange={(event) => setFilters({ ...filters, campaignId: event.target.value })}
              >
                <option value="">All campaigns</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.clientName} — {campaign.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Region</label>
              <select
                value={filters.regionId}
                onChange={(event) => setFilters({ ...filters, regionId: event.target.value })}
              >
                <option value="">All regions</option>
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>From</label>
              <input
                required
                type="date"
                max={filters.to}
                value={filters.from}
                onChange={(event) => setFilters({ ...filters, from: event.target.value })}
              />
            </div>
            <div className="field">
              <label>To</label>
              <input
                required
                type="date"
                min={filters.from}
                max={today}
                value={filters.to}
                onChange={(event) => setFilters({ ...filters, to: event.target.value })}
              />
            </div>
          </div>
          <div>
            <Button type="submit" disabled={loading}>
              {loading ? 'Loading…' : 'Apply filters'}
            </Button>{' '}
            <Button type="button" variant="secondary" onClick={exportCsv} disabled={loading}>
              Export CSV
            </Button>{' '}
            <Button type="button" variant="secondary" onClick={exportPdfReport} disabled={loading}>
              Export PDF
            </Button>
          </div>
        </form>
      </Card>
      <div className="grid-2">
        <Card title="Sales">
          <div className="stat-value">{formatKes(report.sales.total)}</div>
          <small className="muted">{formatNumber(report.sales.count)} transactions</small>
        </Card>
        <Card title="Activations">
          <div className="stat-value">{formatNumber(report.activations.count)}</div>
          <small className="muted">
            {formatNumber(report.activations.footfallCount)} consumers reached
          </small>
        </Card>
        <Card title="Leads">
          <div className="stat-value">{formatNumber(report.leads.count)}</div>
          <small className="muted">
            {formatNumber(report.leads.byStatus?.qualified || 0)} qualified ·{' '}
            {formatNumber(report.leads.byStatus?.converted || 0)} converted
          </small>
        </Card>
        <Card title="Merchandising audits">
          <div className="stat-value">{formatNumber(report.merchandisingAudits.count)}</div>
          <small className="muted">
            {formatNumber(report.merchandisingAudits.lowStockChecks)} low-stock flags ·{' '}
            {formatNumber(report.merchandisingAudits.compliantPlanograms)} compliant planograms
          </small>
        </Card>
      </div>
      <ChartCard title="Activity totals" data={chartData} />
      <Card title="Lead status">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Leads</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(report.leads.byStatus || {}).map(([status, count]) => (
                <tr key={status}>
                  <td>{status.replace(/_/g, ' ')}</td>
                  <td>{formatNumber(count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
