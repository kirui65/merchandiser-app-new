import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import { exportPdf } from '../utils/export';
import { formatDateTime } from '../utils/formatters';

function timestamp(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    const seconds = value.seconds ?? value._seconds;
    return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function displayDate(value) {
  const date = timestamp(value);
  return date ? formatDateTime(date) : '—';
}

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [leadResponse, callResponse] = await Promise.all([
        client.get('/leads'),
        client.get('/calls'),
      ]);
      setLeads(leadResponse.data.leads);
      setCalls(callResponse.data.calls);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to load leads and calls');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const leadNames = new Map(leads.map((lead) => [lead.id, lead.name]));
  const search = query.trim().toLowerCase();
  const visibleLeads = leads.filter((lead) =>
    `${lead.name || ''} ${lead.organization || ''} ${lead.phone || ''} ${lead.status || ''} ${lead.telemarketerId || ''}`
      .toLowerCase()
      .includes(search),
  );
  const visibleCalls = calls.filter((call) =>
    `${leadNames.get(call.leadId) || ''} ${call.telemarketerId || ''} ${call.outcome || ''} ${call.notes || ''}`
      .toLowerCase()
      .includes(search),
  );
  const exportLeads = () =>
    exportPdf(
      'Lead records',
      ['Name', 'Organization', 'Phone', 'Status', 'Score', 'Owner', 'Calls', 'Next follow-up'],
      visibleLeads.map((lead) => [
        lead.name,
        lead.organization || '—',
        lead.phone,
        lead.status?.replace(/_/g, ' ') || '—',
        lead.score || 'unscored',
        lead.telemarketerId,
        lead.callCount || 0,
        displayDate(lead.nextFollowUpAt),
      ]),
      {
        subtitle: `${visibleLeads.length} lead records${search ? ` matching “${query.trim()}”` : ''}`,
      },
    );
  const exportCalls = () =>
    exportPdf(
      'Call activity report',
      ['When', 'Lead', 'Telemarketer', 'Outcome', 'Duration', 'Notes'],
      visibleCalls.map((call) => [
        displayDate(call.startedAt),
        leadNames.get(call.leadId) || call.leadId,
        call.telemarketerId,
        call.outcome?.replace(/_/g, ' ') || '—',
        Number.isFinite(call.durationSeconds) ? `${call.durationSeconds}s` : '—',
        call.notes || '—',
      ]),
      {
        subtitle: `${visibleCalls.length} call records${search ? ` matching “${query.trim()}”` : ''}`,
      },
    );

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">TELEMARKETING</span>
        <h1>Leads</h1>
        <p className="muted">Read-only view of prospects and call activity across the workspace.</p>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <Card title="Lead records">
        <div className="report-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={loading || !visibleLeads.length}
            onClick={exportLeads}
          >
            Export leads PDF
          </Button>
        </div>
        <div className="table-toolbar">
          <label>
            Search leads
            <input
              className="control"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, organization, phone, or owner"
            />
          </label>
          <span className="muted">
            {visibleLeads.length} of {leads.length}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Organization</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Score</th>
                <th>Owner</th>
                <th>Calls</th>
                <th>Next follow-up</th>
              </tr>
            </thead>
            <tbody>
              {visibleLeads.map((lead) => (
                <tr key={lead.id}>
                  <td>{lead.name}</td>
                  <td>{lead.organization || '—'}</td>
                  <td>{lead.phone}</td>
                  <td>{lead.status?.replace(/_/g, ' ') || '—'}</td>
                  <td>{lead.score || 'unscored'}</td>
                  <td>{lead.telemarketerId}</td>
                  <td>{lead.callCount || 0}</td>
                  <td>{displayDate(lead.nextFollowUpAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && visibleLeads.length === 0 ? (
            <EmptyState
              title={leads.length ? 'No matching leads' : 'No leads yet'}
              message={
                leads.length ? 'Try another search.' : 'Telemarketer prospects will appear here.'
              }
            />
          ) : null}
          {loading ? <p className="muted">Loading lead records…</p> : null}
        </div>
      </Card>
      <Card title="Call activity">
        <div className="report-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={loading || !visibleCalls.length}
            onClick={exportCalls}
          >
            Export calls PDF
          </Button>
        </div>
        {loading ? (
          <p className="muted">Loading call activity…</p>
        ) : visibleCalls.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Lead</th>
                  <th>Telemarketer</th>
                  <th>Outcome</th>
                  <th>Duration</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {visibleCalls.map((call) => (
                  <tr key={call.id}>
                    <td>{displayDate(call.startedAt)}</td>
                    <td>{leadNames.get(call.leadId) || call.leadId}</td>
                    <td>{call.telemarketerId}</td>
                    <td>{call.outcome?.replace(/_/g, ' ') || '—'}</td>
                    <td>
                      {Number.isFinite(call.durationSeconds) ? `${call.durationSeconds}s` : '—'}
                    </td>
                    <td>{call.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !loading ? (
          <EmptyState
            title={calls.length ? 'No matching calls' : 'No calls yet'}
            message={
              calls.length ? 'Try another search.' : 'Logged call activity will appear here.'
            }
          />
        ) : null}
      </Card>
      <div style={{ marginTop: 18 }}>
        <Button
          variant="secondary"
          onClick={() => {
            setLoading(true);
            load();
          }}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
    </>
  );
}
