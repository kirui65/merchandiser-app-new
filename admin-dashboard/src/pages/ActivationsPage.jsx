import React, { useEffect, useState } from 'react';
import client from '../api/client';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';
import { formatDateTime } from '../utils/formatters';
import { businessDateKey, businessDateStartIso, businessDateEndIso } from '../utils/businessDate';
import { exportPdf } from '../utils/export';

function toDate(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    const seconds = value.seconds ?? value._seconds;
    return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function amount(value) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export default function ActivationsPage() {
  const [activations, setActivations] = useState([]);
  const [ambassadors, setAmbassadors] = useState([]);
  const [filters, setFilters] = useState({ ambassadorId: '', status: '', from: '', to: '' });
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    const params = {
      ...(filters.ambassadorId ? { ambassadorId: filters.ambassadorId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from ? { from: businessDateStartIso(filters.from) } : {}),
      ...(filters.to ? { to: businessDateEndIso(filters.to) } : {}),
    };
    try {
      const [activationResponse, repsResponse] = await Promise.all([
        client.get('/activations', { params }),
        client.get('/reps'),
      ]);
      setActivations(activationResponse.data.activations);
      setAmbassadors(repsResponse.data.reps.filter((rep) => rep.role === 'brand_ambassador'));
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to load activations');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function reviewActivation(activation, status) {
    setReviewingId(activation.id);
    setError(null);
    try {
      const response = await client.patch(`/activations/${encodeURIComponent(activation.id)}`, {
        status,
      });
      setActivations((current) =>
        current.flatMap((item) => {
          if (item.id !== activation.id) return [item];
          return filters.status && response.data.activation.status !== filters.status
            ? []
            : [response.data.activation];
        }),
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message || `Could not ${status} this activation.`,
      );
    } finally {
      setReviewingId(null);
    }
  }

  function exportActivations() {
    const rows = activations.map((activation) => {
      const ambassador = ambassadors.find((item) => item.id === activation.ambassadorId);
      const expenses = activation.expenses || [];
      const samples = activation.samplesDistributed || [];
      return [
        toDate(activation.startedAt) ? formatDateTime(toDate(activation.startedAt)) : '—',
        ambassador?.name || activation.ambassadorId,
        activation.activityType?.replace(/_/g, ' ') || '—',
        activation.status || '—',
        activation.footfallCount || 0,
        samples.reduce((total, sample) => total + Number(sample.quantity || 0), 0),
        amount(activation.floatAmount),
        amount(expenses.reduce((total, expense) => total + Number(expense.amount || 0), 0)),
      ];
    });
    exportPdf(
      'Brand activation report',
      [
        'Started',
        'Ambassador',
        'Activity',
        'Status',
        'Footfall',
        'Samples',
        'Float (KES)',
        'Expenses (KES)',
      ],
      rows,
      { subtitle: `${activations.length} activations` },
    );
  }

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">FIELD ACTIVITY</span>
        <h1>Activations</h1>
        <p className="muted">
          Review submitted ambassador activities alongside consumer reach, samples, and float.
        </p>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <Card title="Filters">
        <div className="grid-2">
          <div className="field">
            <label>Ambassador</label>
            <select
              value={filters.ambassadorId}
              onChange={(event) => setFilters({ ...filters, ambassadorId: event.target.value })}
            >
              <option value="">All ambassadors</option>
              {ambassadors.map((ambassador) => (
                <option key={ambassador.id} value={ambassador.id}>
                  {ambassador.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select
              value={filters.status}
              onChange={(event) => setFilters({ ...filters, status: event.target.value })}
            >
              <option value="">All statuses</option>
              {['draft', 'submitted', 'approved', 'rejected'].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Started from</label>
            <input
              type="date"
              max={filters.to || undefined}
              value={filters.from}
              onChange={(event) => setFilters({ ...filters, from: event.target.value })}
            />
          </div>
          <div className="field">
            <label>Started to</label>
            <input
              type="date"
              min={filters.from || undefined}
              max={businessDateKey()}
              value={filters.to}
              onChange={(event) => setFilters({ ...filters, to: event.target.value })}
            />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <Button onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Apply filters'}
          </Button>
        </div>
      </Card>
      <div className="report-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={loading || !activations.length}
          onClick={exportActivations}
        >
          Export PDF
        </Button>
      </div>
      <Card title={`${activations.length} activations`}>
        {loading ? (
          <p className="muted">Loading activation records…</p>
        ) : activations.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Ambassador</th>
                  <th>Activity</th>
                  <th>Status</th>
                  <th>Footfall</th>
                  <th>Samples</th>
                  <th>Float (KES)</th>
                  <th>Expenses (KES)</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {activations.map((activation) => {
                  const ambassador = ambassadors.find(
                    (item) => item.id === activation.ambassadorId,
                  );
                  const expenses = activation.expenses || [];
                  const samples = activation.samplesDistributed || [];
                  return (
                    <tr key={activation.id}>
                      <td>
                        {toDate(activation.startedAt)
                          ? formatDateTime(toDate(activation.startedAt))
                          : '—'}
                      </td>
                      <td>{ambassador?.name || activation.ambassadorId}</td>
                      <td>{activation.activityType?.replace(/_/g, ' ') || '—'}</td>
                      <td>{activation.status || '—'}</td>
                      <td>{activation.footfallCount || 0}</td>
                      <td>
                        {samples.reduce((total, sample) => total + Number(sample.quantity || 0), 0)}
                      </td>
                      <td>{amount(activation.floatAmount)}</td>
                      <td>
                        {amount(
                          expenses.reduce(
                            (total, expense) => total + Number(expense.amount || 0),
                            0,
                          ),
                        )}
                      </td>
                      <td>
                        {activation.status === 'submitted' ? (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <Button
                              variant="secondary"
                              disabled={reviewingId === activation.id}
                              onClick={() => reviewActivation(activation, 'rejected')}
                            >
                              {reviewingId === activation.id ? 'Saving…' : 'Reject'}
                            </Button>
                            <Button
                              disabled={reviewingId === activation.id}
                              onClick={() => reviewActivation(activation, 'approved')}
                            >
                              {reviewingId === activation.id ? 'Saving…' : 'Approve'}
                            </Button>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No activation records"
            message="Brand ambassador field activities will appear here."
          />
        )}
      </Card>
    </>
  );
}
