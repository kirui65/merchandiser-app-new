import React, { useCallback, useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import Button from '../components/Button';
import Card from '../components/Card';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import RefreshStatus from '../components/RefreshStatus';
import { apiErrorMessage, useConfirm, useToast } from '../components/Feedback';
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
  const [updatedAt, setUpdatedAt] = useState(null);
  const confirm = useConfirm();
  const toast = useToast();

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
      setUpdatedAt(Date.now());
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
    const confirmed = await confirm({
      title: `Archive “${broadcast.title}”?`,
      message: 'The announcement will no longer show in the team’s feed.',
      confirmLabel: 'Archive',
      tone: 'danger',
    });
    if (!confirmed) return;
    setArchivingId(broadcast.id);
    try {
      await client.delete(`/broadcasts/${encodeURIComponent(broadcast.id)}`);
      setBroadcasts((current) =>
        current.map((item) => (item.id === broadcast.id ? { ...item, status: 'archived' } : item)),
      );
      toast.success('Broadcast archived.');
    } catch (requestError) {
      toast.error(apiErrorMessage(requestError, 'Could not archive this broadcast.'));
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
        <RefreshStatus updatedAt={updatedAt} onRefresh={load} loading={loading} />
      </Card>
      <Card title={`${visibleBroadcasts.length} broadcasts`}>
        <DataTable
          loading={loading && !broadcasts.length}
          rows={visibleBroadcasts}
          rowLabel="broadcasts"
          initialSort={{ key: 'published', direction: 'desc' }}
          columns={[
            {
              key: 'published',
              header: 'Published',
              sortValue: (broadcast) => dateValue(broadcast.publishedAt || broadcast.createdAt),
              render: (broadcast) => {
                const date = dateValue(broadcast.publishedAt || broadcast.createdAt);
                return date ? formatDateTime(date) : '—';
              },
            },
            {
              key: 'team',
              header: 'Team',
              sortValue: (broadcast) => teamNames.get(broadcast.teamId) || broadcast.teamId,
              render: (broadcast) => teamNames.get(broadcast.teamId) || broadcast.teamId,
            },
            {
              key: 'title',
              header: 'Title and message',
              className: 'message-cell',
              sortValue: (broadcast) => broadcast.title,
              render: (broadcast) => (
                <>
                  <strong>{broadcast.title}</strong>
                  <br />
                  <span className="muted" title={broadcast.message}>
                    {broadcast.message}
                  </span>
                </>
              ),
            },
            { key: 'senderId', header: 'Sender' },
            {
              key: 'status',
              header: 'Status',
              sortValue: (broadcast) => broadcast.status,
              render: (broadcast) => (
                <span className={`status-pill status-${broadcast.status}`}>{broadcast.status}</span>
              ),
            },
            {
              key: 'expires',
              header: 'Expires',
              sortValue: (broadcast) => dateValue(broadcast.expiresAt),
              render: (broadcast) =>
                dateValue(broadcast.expiresAt)
                  ? formatDateTime(dateValue(broadcast.expiresAt))
                  : '—',
            },
            {
              key: 'action',
              header: 'Action',
              render: (broadcast) =>
                broadcast.status !== 'archived' ? (
                  <Button
                    variant="secondary"
                    disabled={archivingId === broadcast.id}
                    onClick={() => archive(broadcast)}
                  >
                    {archivingId === broadcast.id ? 'Archiving…' : 'Archive'}
                  </Button>
                ) : (
                  '—'
                ),
            },
          ]}
          empty={
            <EmptyState
              title={broadcasts.length ? 'No matching broadcasts' : 'No broadcasts yet'}
              message={
                broadcasts.length
                  ? 'Try a different search, status or team.'
                  : 'Team leaders’ announcements will appear here.'
              }
              action={
                broadcasts.length && (query || status || teamId)
                  ? {
                      label: 'Clear filters',
                      onClick: () => {
                        setQuery('');
                        setStatus('');
                        setTeamId('');
                      },
                    }
                  : undefined
              }
            />
          }
        />
      </Card>
    </>
  );
}
