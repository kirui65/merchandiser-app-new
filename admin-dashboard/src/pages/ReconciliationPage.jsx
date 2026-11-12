import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';
import { downloadCsv, exportPdf } from '../utils/export';
import { formatKes } from '../utils/formatters';
import { businessDateKey, businessDateStartIso, businessDateEndIso } from '../utils/businessDate';

const today = businessDateKey();
const monthStart = `${today.slice(0, 7)}-01`;

export default function ReconciliationPage() {
  const [draft, setDraft] = useState({ from: monthStart, to: today });
  const [range, setRange] = useState({ from: monthStart, to: today });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await client.get('/mpesa/reconciliation', {
        params: { from: businessDateStartIso(range.from), to: businessDateEndIso(range.to) },
      });
      setResult(data);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message ||
          'Failed to load reconciliation. Check the connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const matches = result?.matches || [];
  const unmatchedSales = result?.unmatchedSales || [];
  const unmatchedTransactions = result?.unmatchedTransactions || [];
  const reported =
    matches.reduce((sum, item) => sum + Number(item.sale.total), 0) +
    unmatchedSales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const collected =
    matches.reduce((sum, item) => sum + Number(item.transaction.amount), 0) +
    unmatchedTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const variance = collected - reported;
  const headers = ['Type', 'ID / receipt', 'Rep ID', 'Amount (KES)', 'Timestamp'];
  const rows = [
    ['Summary', 'Reported total', '', formatKes(reported), `${range.from} to ${range.to}`],
    ['Summary', 'Collected total', '', formatKes(collected), `${range.from} to ${range.to}`],
    ['Summary', 'Variance', '', formatKes(variance), `${range.from} to ${range.to}`],
    ...unmatchedSales.map((sale) => ['Sale', sale.id, sale.repId, sale.total, sale.timestamp]),
    ...unmatchedTransactions.map((transaction) => [
      'M-Pesa payment',
      transaction.mpesaReceiptNumber || transaction.id,
      transaction.repId,
      transaction.amount,
      transaction.timestamp,
    ]),
  ];

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">MONEY CONTROL</span>
        <h1>M-Pesa reconciliation</h1>
        <p className="muted">Compare reported sales against collected payments.</p>
        <form
          className="filter-row"
          onSubmit={(event) => {
            event.preventDefault();
            setRange({ ...draft });
          }}
        >
          <label>
            From{' '}
            <input
              required
              type="date"
              value={draft.from}
              max={draft.to}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            />
          </label>
          <label>
            To{' '}
            <input
              required
              type="date"
              value={draft.to}
              min={draft.from}
              max={today}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            />
          </label>
          <Button type="submit" disabled={loading}>
            {loading ? 'Loading…' : 'Apply range'}
          </Button>
        </form>
        <div className="report-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={!result || loading}
            onClick={() =>
              downloadCsv(`brandsphere-unmatched-${range.from}-${range.to}.csv`, headers, rows)
            }
          >
            Export unmatched CSV
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!result || loading}
            onClick={() =>
              exportPdf('M-Pesa reconciliation report', headers, rows, {
                subtitle: `${range.from} to ${range.to} · ${matches.length} matched · ${unmatchedSales.length + unmatchedTransactions.length} unmatched`,
              })
            }
          >
            Export PDF
          </Button>
        </div>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <Button type="button" variant="secondary" onClick={load} disabled={loading}>
            {loading ? 'Retrying…' : 'Retry'}
          </Button>
        </div>
      )}
      {loading && !result ? (
        <Card>
          <div className="skeleton" />
          <div className="skeleton" />
        </Card>
      ) : null}
      {result && (
        <>
          <div className="stat-grid reconciliation-stats">
            <Card>
              <span className="muted">Reported</span>
              <div className="stat-value">{formatKes(reported)}</div>
            </Card>
            <Card>
              <span className="muted">Collected</span>
              <div className="stat-value">{formatKes(collected)}</div>
            </Card>
            <Card className={variance === 0 ? '' : 'reconciliation-variance'}>
              <span className="muted">Variance</span>
              <div className="stat-value">{formatKes(variance)}</div>
            </Card>
          </div>
          <div className="grid-2 reconciliation-lists">
            <Card title={`Matched (${matches.length})`}>
              {matches.length ? (
                <div className="reconciliation-record-list">
                  {matches.map(({ sale, transaction }) => (
                    <div key={transaction.id}>
                      <strong>{formatKes(sale.total)}</strong>
                      <span>
                        Sale {sale.id} matched to {transaction.mpesaReceiptNumber || transaction.id}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No matched payments" />
              )}
            </Card>
            <Card title={`Unmatched sales (${unmatchedSales.length})`}>
              {unmatchedSales.length ? (
                <div className="reconciliation-record-list">
                  {unmatchedSales.map((sale) => (
                    <div key={sale.id}>
                      <strong>{formatKes(sale.total)}</strong>
                      <span>
                        Sale {sale.id} · {sale.repId}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No unmatched sales" />
              )}
            </Card>
            <Card title={`Unmatched payments (${unmatchedTransactions.length})`}>
              {unmatchedTransactions.length ? (
                <div className="reconciliation-record-list">
                  {unmatchedTransactions.map((transaction) => (
                    <div key={transaction.id}>
                      <strong>{formatKes(transaction.amount)}</strong>
                      <span>
                        {transaction.mpesaReceiptNumber || transaction.id} · Rep {transaction.repId}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No unmatched payments" />
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
