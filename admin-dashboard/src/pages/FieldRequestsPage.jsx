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

export default function FieldRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [teams, setTeams] = useState([]);
  const [status, setStatus] = useState('pending');
  const [teamId, setTeamId] = useState('');
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [requestResponse, teamResponse] = await Promise.all([
        client.get('/field-requests'),
        client.get('/teams'),
      ]);
      setRequests(requestResponse.data.requests || []);
      setTeams(teamResponse.data.teams || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not load field requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const teamNames = useMemo(() => new Map(teams.map((team) => [team.id, team.name])), [teams]);
  const visibleRequests = requests.filter(
    (request) => (!status || request.status === status) && (!teamId || request.teamId === teamId),
  );

  async function review(request, nextStatus) {
    setReviewingId(request.id);
    setError(null);
    try {
      const response = await client.patch(
        `/field-requests/${encodeURIComponent(request.id)}/review`,
        { status: nextStatus },
      );
      setRequests((current) =>
        current.map((item) => (item.id === request.id ? response.data.request : item)),
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.error?.message || `Could not ${nextStatus} this request.`,
      );
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">TEAM OVERSIGHT</span>
        <h1>Field requests</h1>
        <p className="muted">Review leave and field support requests submitted by field teams.</p>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <Card title="Filters">
        <div className="grid-2">
          <div className="field">
            <label htmlFor="field-request-status">Status</label>
            <select
              id="field-request-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              {['pending', 'approved', 'rejected'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="field-request-team">Team</label>
            <select
              id="field-request-team"
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
      <Card title={`${visibleRequests.length} requests`}>
        {loading ? (
          <p className="muted">Loading field requests…</p>
        ) : visibleRequests.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Requester</th>
                  <th>Team</th>
                  <th>Type</th>
                  <th>Requested period</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {visibleRequests.map((request) => (
                  <tr key={request.id}>
                    <td>
                      {dateValue(request.createdAt)
                        ? formatDateTime(dateValue(request.createdAt))
                        : '—'}
                    </td>
                    <td>{request.requesterName || request.requesterId}</td>
                    <td>{teamNames.get(request.teamId) || request.teamId}</td>
                    <td>{request.requestType === 'leave' ? 'Leave' : 'Field'}</td>
                    <td>
                      {dateValue(request.startsAt)
                        ? formatDateTime(dateValue(request.startsAt))
                        : '—'}
                      {request.endsAt && dateValue(request.endsAt) ? (
                        <> – {formatDateTime(dateValue(request.endsAt))}</>
                      ) : null}
                    </td>
                    <td className="message-cell" title={request.reason || ''}>
                      {request.reason || '—'}
                    </td>
                    <td>{request.status}</td>
                    <td>
                      {request.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button
                            variant="secondary"
                            disabled={reviewingId === request.id}
                            onClick={() => review(request, 'rejected')}
                          >
                            {reviewingId === request.id ? 'Saving…' : 'Reject'}
                          </Button>
                          <Button
                            disabled={reviewingId === request.id}
                            onClick={() => review(request, 'approved')}
                          >
                            {reviewingId === request.id ? 'Saving…' : 'Approve'}
                          </Button>
                        </div>
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
            title="No matching requests"
            message="Field staff requests will appear here when submitted."
          />
        ) : null}
      </Card>
    </>
  );
}
