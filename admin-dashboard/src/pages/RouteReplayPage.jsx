import React, { useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import MapView from '../components/MapView';
import Card from '../components/Card';
import { downloadCsv, exportPdf } from '../utils/export';
import { formatDateTime } from '../utils/formatters';
import { businessDateKey } from '../utils/businessDate';

const today = businessDateKey();

export default function RouteReplayPage() {
  const [date, setDate] = useState(today);
  const [repId, setRepId] = useState('');
  const [reps, setReps] = useState([]);
  const [route, setRoute] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  useEffect(() => {
    client
      .get('/reps')
      .then(({ data }) => {
        setReps(data.reps);
        if (data.reps[0]) setRepId(data.reps[0].id);
      })
      .catch(() => setError('Failed to load reps'));
  }, []);
  useEffect(() => {
    let active = true;
    setError(null);
    setRoute(null);
    setOutlets([]);
    setPosition(0);
    setLoadingRoute(Boolean(repId));
    if (!repId)
      return () => {
        active = false;
      };
    Promise.all([
      client.get('/routes', { params: { date, repId } }),
      client.get('/outlets', { params: { repId } }),
    ])
      .then(([routeResponse, outletResponse]) => {
        if (!active) return;
        const loadedRoute = routeResponse.data.route;
        setRoute(loadedRoute);
        setOutlets(
          outletResponse.data.outlets.filter((outlet) =>
            loadedRoute.plannedOutletIds.includes(outlet.id),
          ),
        );
        setPosition(loadedRoute.pings.length ? loadedRoute.pings.length - 1 : 0);
      })
      .catch(() => {
        if (active) setError('Failed to load route');
      })
      .finally(() => {
        if (active) setLoadingRoute(false);
      });
    return () => {
      active = false;
    };
  }, [date, repId]);
  const visiblePings = useMemo(() => route?.pings.slice(0, position + 1) || [], [route, position]);
  const missedCount = route
    ? route.plannedOutletIds.filter((id) => !route.visitedOutletIds.includes(id)).length
    : 0;
  const headers = ['#', 'Timestamp', 'Latitude', 'Longitude'];
  const rows = (route?.pings || []).map((ping, index) => [
    index + 1,
    ping.timestamp,
    ping.lat,
    ping.lng,
  ]);
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">FIELD INTELLIGENCE</span>
        <h1>Route replay</h1>
        <p className="muted">Review movement and outlet coverage by representative.</p>
        {route && (
          <p>
            <button
              className="ui-button ui-button-secondary"
              onClick={() => downloadCsv(`brandsphere-route-${repId}-${date}.csv`, headers, rows)}
            >
              Export CSV
            </button>{' '}
            <button
              className="ui-button ui-button-secondary"
              onClick={() =>
                exportPdf('Route replay report', headers, rows, {
                  subtitle: `${reps.find((rep) => rep.id === repId)?.name || 'Representative'} · ${date} · ${route.pings.length} GPS pings`,
                })
              }
            >
              Export PDF
            </button>
          </p>
        )}
      </div>
      <Card>
        <div className="grid-2">
          <div className="field">
            <label>Representative</label>
            <select
              className="control"
              value={repId}
              onChange={(event) => setRepId(event.target.value)}
            >
              <option value="">Select rep</option>
              {reps.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Date</label>
            <input
              className="control"
              type="date"
              max={today}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
        </div>
      </Card>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {loadingRoute && (
        <Card>
          <div className="skeleton" />
          <div className="skeleton" />
        </Card>
      )}
      {route && (
        <Card
          title={`${route.pings.length} pings · ${route.visitedOutletIds.length} visited · ${missedCount} missed`}
        >
          {route.pings.length ? (
            <>
              <div className="route-map-legend">
                <span>
                  <i className="visited" /> Visited outlet
                </span>
                <span>
                  <i className="missed" /> Missed outlet
                </span>
                <span>
                  <i className="route" /> GPS route
                </span>
              </div>
              <MapView
                pings={visiblePings}
                outlets={outlets}
                visitedOutletIds={route.visitedOutletIds}
              />
              <div className="field route-replay-control">
                <label htmlFor="route-replay-position">Replay position</label>
                <input
                  id="route-replay-position"
                  type="range"
                  min="0"
                  max={Math.max(route.pings.length - 1, 0)}
                  value={position}
                  onChange={(event) => setPosition(Number(event.target.value))}
                />
                <div className="route-replay-time">
                  <span>
                    Ping {position + 1} of {route.pings.length}
                  </span>
                  {visiblePings.at(-1) && (
                    <strong>{formatDateTime(visiblePings.at(-1).timestamp)}</strong>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="muted">No GPS pings were recorded for this route.</p>
          )}
        </Card>
      )}
    </>
  );
}
