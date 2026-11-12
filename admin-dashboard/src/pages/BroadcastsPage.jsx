import React, { useCallback, useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import { formatDateTime } from '../utils/formatters';

function dateValue(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    const seconds = value.seconds ?? value._seconds;
    return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState([]);
  const [teams, setTeams] = useState([]);
  const [status, setStatus] = useState('');
  const [teamId, setTeamId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [archivingId, setArchivingId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [broadcastResponse, teamResponse] = await Promise.all([
        client.get('/broadcasts'),
        client.get('/teams'),
      ]);
      setBroadcasts(broadcastResponse.data.broadcasts || []);
      setTeams(teamResponse.data.teams || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not load team broadcasts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const teamNames = useMemo(() => new Map(teams.map((team) => [team.id, team.name])), [teams]);
  const visibleBroadcasts = broadcasts.filter(
    (broadcast) =>
      (!status || broadcast.status === status) &&
      (!teamId || broadcast.teamId === teamId) &&
      `${broadcast.title || ''} ${broadcast.message || ''} ${teamNames.get(broadcast.teamId) || ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );

  async function archive(broadcast) {
    if (!window.confirm(`Archive “${broadcast.title}”?`)) return;
    setArchivingId(broadcast.id);
    setError(null);
    try {
      await client.delete(`/broadcasts/${encodeURIComponent(broadcast.id)}`);
      setBroadcasts((current) =>
        current.map((item) => (item.id === broadcast.id ? { ...item, status: 'archived' } : item)),
      );
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not archive this broadcast.');
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">TEAM COMMUNICATION</span>
        <h1>Broadcasts</h1>
        <p className="muted">
          Review team announcements and archive messages that are no longer relevant.
        </p>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <Card title="Filters">
        <div className="grid-2">
          <div className="field">
            <label htmlFor="broadcast-search">Search announcements</label>
            <input
              id="broadcast-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, message, or team"
            />
          </div>
          <div className="field">
            <label htmlFor="broadcast-status">Status</label>
            <select
              id="broadcast-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              {['draft', 'published', 'archived'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="broadcast-team">Team</label>
            <select
              id="broadcast-team"
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
            >
              <option value="">All teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
      </Card>
      <Card title={`${visibleBroadcasts.length} broadcasts`}>
        {loading ? (
          <p className="muted">Loading announcements…</p>
        ) : visibleBroadcasts.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Published</th>
                  <th>Team</th>
                  <th>Title and message</th>
                  <th>Sender</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleBroadcasts.map((broadcast) => (
                  <tr key={broadcast.id}>
                    <td>
                      {dateValue(broadcast.publishedAt || broadcast.createdAt)
                        ? formatDateTime(dateValue(broadcast.publishedAt || broadcast.createdAt))
                        : '—'}
                    </td>
                    <td>{teamNames.get(broadcast.teamId) || broadcast.teamId}</td>
                    <td className="message-cell">
                      <strong>{broadcast.title}</strong>
                      <br />
                      <span className="muted" title={broadcast.message}>
                        {broadcast.message}
                      </span>
                    </td>
                    <td>{broadcast.senderId}</td>
                    <td>{broadcast.status}</td>
                    <td>
                      {dateValue(broadcast.expiresAt)
                        ? formatDateTime(dateValue(broadcast.expiresAt))
                        : '—'}
                    </td>
                    <td>
                      {broadcast.status !== 'archived' ? (
                        <Button
                          variant="secondary"
                          disabled={archivingId === broadcast.id}
                          onClick={() => archive(broadcast)}
                        >
                          {archivingId === broadcast.id ? 'Archiving…' : 'Archive'}
                        </Button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !loading ? (
          <EmptyState
            title="No matching broadcasts"
            message="Team leaders’ announcements will appear here."
          />
        ) : null}
      </Card>
    </>
  );
}
