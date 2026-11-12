import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import { formatDateTime } from '../utils/formatters';
import { exportPdf } from '../utils/export';

function asDate(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    const seconds = value.seconds ?? value._seconds;
    return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function displayDate(value) {
  const date = asDate(value);
  return date ? formatDateTime(date) : '—';
}

function kes(value) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export default function MerchandisingPage() {
  const [audits, setAudits] = useState([]);
  const [prices, setPrices] = useState([]);
  const [onboarding, setOnboarding] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [products, setProducts] = useState([]);
  const [merchandisers, setMerchandisers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reviewingId, setReviewingId] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        auditResponse,
        priceResponse,
        onboardingResponse,
        outletResponse,
        repResponse,
        productResponse,
      ] = await Promise.all([
        client.get('/merchandising/audits', { params: { lowStock: 'true' } }),
        client.get('/merchandising/competitor-prices'),
        client.get('/merchandising/outlet-onboarding', { params: { status: 'pending_review' } }),
        client.get('/outlets'),
        client.get('/reps'),
        client.get('/products'),
      ]);
      setAudits(auditResponse.data.audits || []);
      setPrices(priceResponse.data.observations || []);
      setOnboarding(onboardingResponse.data.onboarding || []);
      setOutlets(outletResponse.data.outlets || []);
      setProducts(productResponse.data.products || []);
      setMerchandisers((repResponse.data.reps || []).filter((rep) => rep.role === 'rep'));
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message || 'Failed to load merchandising reports',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function review(id, status) {
    setReviewingId(id);
    setError(null);
    try {
      await client.patch(`/merchandising/outlet-onboarding/${id}/review`, { status });
      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message || `Could not ${status} outlet submission`,
      );
    } finally {
      setReviewingId(null);
    }
  }

  const outletNames = new Map(outlets.map((outlet) => [outlet.id, outlet.name]));
  const productNames = new Map(products.map((product) => [product.id, product.name]));
  const repNames = new Map(merchandisers.map((rep) => [rep.id, rep.name]));
  const lowStockRows = audits.flatMap((audit) =>
    (audit.stockChecks || [])
      .filter((check) => check.lowStock)
      .map((check) => ({ ...check, audit })),
  );
  const exportLowStock = () =>
    exportPdf(
      'Low-stock alert report',
      ['Observed', 'Outlet', 'Product', 'Shelf', 'Backroom', 'Reorder', 'Merchandiser'],
      lowStockRows.map(({ audit, ...check }) => [
        displayDate(audit.observedAt),
        outletNames.get(audit.outletId) || audit.outletId,
        productNames.get(check.productId) || check.productId,
        check.shelfQuantity ?? '—',
        check.backroomQuantity ?? '—',
        check.reorderRequested ? 'Requested' : '—',
        repNames.get(audit.merchandiserId) || audit.merchandiserId,
      ]),
      { subtitle: `${lowStockRows.length} low-stock alerts` },
    );
  const exportPrices = () =>
    exportPdf(
      'Competitor price report',
      ['Observed', 'Outlet', 'Competitor', 'Product', 'Price (KES)', 'Our product', 'Merchandiser'],
      prices.map((price) => [
        displayDate(price.observedAt),
        outletNames.get(price.outletId) || price.outletId,
        price.competitorName,
        price.competitorProductName,
        kes(price.price),
        productNames.get(price.ourProductId) || price.ourProductId || '—',
        repNames.get(price.merchandiserId) || price.merchandiserId,
      ]),
      { subtitle: `${prices.length} recent competitor price observations` },
    );
  const exportApprovals = () =>
    exportPdf(
      'Pending outlet approval report',
      ['Outlet', 'Address', 'Submitted by', 'Submitted', 'GPS pin', 'Photo'],
      onboarding.map((entry) => [
        entry.name,
        entry.address,
        repNames.get(entry.submittedBy) || entry.submittedBy,
        displayDate(entry.createdAt),
        entry.location ? `${entry.location.lat.toFixed(4)}, ${entry.location.lng.toFixed(4)}` : '—',
        entry.photoStorageUri ? 'Photo submitted' : 'No photo',
      ]),
      { subtitle: `${onboarding.length} pending outlet submissions` },
    );
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">FIELD MERCHANDISING</span>
        <h1>Merchandising</h1>
        <p className="muted">
          Review shelf availability, competitor pricing, and new outlet submissions.
        </p>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <Card title="Low-stock alerts">
        <div className="report-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={loading || !lowStockRows.length}
            onClick={exportLowStock}
          >
            Export PDF
          </Button>
        </div>
        {loading ? (
          <p className="muted">Loading stock checks…</p>
        ) : lowStockRows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Observed</th>
                  <th>Outlet</th>
                  <th>Product</th>
                  <th>Shelf</th>
                  <th>Backroom</th>
                  <th>Reorder</th>
                  <th>Merchandiser</th>
                </tr>
              </thead>
              <tbody>
                {lowStockRows.map(({ audit, ...check }, index) => (
                  <tr key={`${audit.id}-${check.productId}-${index}`}>
                    <td>{displayDate(audit.observedAt)}</td>
                    <td>{outletNames.get(audit.outletId) || audit.outletId}</td>
                    <td>{productNames.get(check.productId) || check.productId}</td>
                    <td>{Number.isFinite(check.shelfQuantity) ? check.shelfQuantity : '—'}</td>
                    <td>
                      {Number.isFinite(check.backroomQuantity) ? check.backroomQuantity : '—'}
                    </td>
                    <td>{check.reorderRequested ? 'Requested' : '—'}</td>
                    <td>{repNames.get(audit.merchandiserId) || audit.merchandiserId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !loading ? (
          <EmptyState
            title="No low-stock alerts"
            message="Low-stock and reorder flags from outlet checks appear here."
          />
        ) : null}
      </Card>

      <Card title="Competitor price observations">
        <div className="report-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={loading || !prices.length}
            onClick={exportPrices}
          >
            Export PDF
          </Button>
        </div>
        {loading ? (
          <p className="muted">Loading competitor prices…</p>
        ) : prices.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Observed</th>
                  <th>Outlet</th>
                  <th>Competitor</th>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Our product</th>
                  <th>Merchandiser</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((price) => (
                  <tr key={price.id}>
                    <td>{displayDate(price.observedAt)}</td>
                    <td>{outletNames.get(price.outletId) || price.outletId}</td>
                    <td>{price.competitorName}</td>
                    <td>{price.competitorProductName}</td>
                    <td>{kes(price.price)}</td>
                    <td>{productNames.get(price.ourProductId) || price.ourProductId || '—'}</td>
                    <td>{repNames.get(price.merchandiserId) || price.merchandiserId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">
              Recent observations are listed by date to make price movement easy to compare.
            </p>
          </div>
        ) : !loading ? (
          <EmptyState
            title="No competitor prices"
            message="Field price observations will appear here."
          />
        ) : null}
      </Card>

      <Card title="Pending outlet approvals">
        <div className="report-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={loading || !onboarding.length}
            onClick={exportApprovals}
          >
            Export PDF
          </Button>
        </div>
        {loading ? (
          <p className="muted">Loading outlet submissions…</p>
        ) : onboarding.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Outlet</th>
                  <th>Address</th>
                  <th>Submitted by</th>
                  <th>Submitted</th>
                  <th>GPS pin</th>
                  <th>Photo</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {onboarding.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.name}</td>
                    <td>{entry.address}</td>
                    <td>{repNames.get(entry.submittedBy) || entry.submittedBy}</td>
                    <td>{displayDate(entry.createdAt)}</td>
                    <td>
                      {entry.location
                        ? `${entry.location.lat.toFixed(4)}, ${entry.location.lng.toFixed(4)}`
                        : '—'}
                    </td>
                    <td>
                      {entry.photoStorageUri ? (
                        <Button
                          variant="secondary"
                          onClick={async () => {
                            try {
                              const { data } = await client.get(
                                `/merchandising/outlet-onboarding/${entry.id}/photo-url`,
                              );
                              setPhotoPreview({ url: data.url, name: entry.name });
                            } catch (requestError) {
                              setError(
                                requestError.response?.data?.error?.message ||
                                  'Could not load the outlet photo',
                              );
                            }
                          }}
                        >
                          View
                        </Button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div className="review-actions">
                        <Button
                          disabled={reviewingId === entry.id}
                          onClick={() => review(entry.id, 'approved')}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="danger"
                          disabled={reviewingId === entry.id}
                          onClick={() => review(entry.id, 'rejected')}
                        >
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !loading ? (
          <EmptyState
            title="No pending outlet approvals"
            message="New outlet submissions from field merchandisers appear here for review."
          />
        ) : null}
      </Card>

      <div style={{ marginTop: 18 }}>
        <Button variant="secondary" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      {photoPreview ? (
        <div className="command-backdrop" role="presentation" onClick={() => setPhotoPreview(null)}>
          <section
            className="ui-card"
            role="dialog"
            aria-modal="true"
            aria-label={`${photoPreview.name} outlet photo`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="ui-card-heading">
              <h2>{photoPreview.name} outlet photo</h2>
              <Button variant="secondary" onClick={() => setPhotoPreview(null)}>
                Close
              </Button>
            </div>
            <img
              src={photoPreview.url}
              alt={`Submitted photo for ${photoPreview.name}`}
              style={{
                display: 'block',
                maxWidth: 'min(80vw, 800px)',
                maxHeight: '70vh',
                objectFit: 'contain',
                margin: 'auto',
              }}
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
