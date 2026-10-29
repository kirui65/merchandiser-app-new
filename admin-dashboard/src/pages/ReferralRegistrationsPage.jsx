import React, { useCallback, useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import Card from '../components/Card';
import Button from '../components/Button';
import { exportPdf } from '../utils/export';
import { formatDateTime } from '../utils/formatters';

const statuses = ['submitted', 'contacted', 'requirements_checked', 'training_scheduled', 'placed', 'rejected'];
const label = (value) => String(value || '').replace(/_/g, ' ');
const sourceLabel = (source) => source === 'web_engagement' ? 'Online engagement' : source === 'web_ad' ? 'Web ad' : 'Recruiter app';
const isUnclaimedWebLead = (row) => ['web_ad', 'web_engagement'].includes(row.source) && !row.recruiterId;
function referralDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'object' && (value.seconds ?? value._seconds) != null) {
    return new Date((value.seconds ?? value._seconds) * 1000);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
const registeredAt = (row) => {
  const date = referralDate(row.createdAt);
  return date ? formatDateTime(date) : '—';
};

export default function ReferralRegistrationsPage() {
  const [rows, setRows] = useState([]);
  const [reps, setReps] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [action, setAction] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [paymentReference, setPaymentReference] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [referralResponse, summaryResponse, repResponse] = await Promise.all([
        client.get('/referrals'),
        client.get('/referrals/summary'),
        client.get('/reps').catch(() => ({ data: { reps: [] } })),
      ]);
      setRows(referralResponse.data.referrals || []);
      setSummary(summaryResponse.data.summary || null);
      setReps(repResponse.data.reps || []);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not load applicant referrals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const campaigns = useMemo(() => [...new Set(rows.map((row) => row.campaignName).filter(Boolean))], [rows]);
  const recruiterNameById = useMemo(() => Object.fromEntries(reps
    .filter((rep) => rep.role === 'recruiter' && rep.id && rep.name)
    .map((rep) => [rep.id, rep.name])), [reps]);
  const recruiterName = (row) => !row.recruiterId ? 'Unclaimed web lead' : row.recruiterName && row.recruiterName !== row.recruiterId
    ? row.recruiterName
    : recruiterNameById[row.recruiterId] || 'Unknown recruiter';
  const activeRecruiters = useMemo(() => {
    const recruiterById = Object.fromEntries(reps
      .filter((rep) => rep.role === 'recruiter' && rep.id)
      .map((rep) => [rep.id, rep]));
    const counts = rows
      .filter((row) => row.recruiterId && row.status !== 'rejected')
      .reduce((result, row) => {
        result[row.recruiterId] = (result[row.recruiterId] || 0) + 1;
        return result;
      }, {});
    return Object.entries(counts)
      .map(([id, count]) => ({ recruiter: recruiterById[id], id, count }))
      .sort((a, b) => b.count - a.count || (a.recruiter?.name || '').localeCompare(b.recruiter?.name || ''));
  }, [reps, rows]);
  const [campaignFilter, setCampaignFilter] = useState('');
  const filteredRows = rows.filter((row) => (!statusFilter || row.status === statusFilter)
    && (!sourceFilter || (row.source || 'recruiter_app') === sourceFilter)
    && (!campaignFilter || row.campaignName === campaignFilter)
    && `${row.applicantName || ''} ${row.phone || ''} ${row.email || ''} ${row.campaignName || ''} ${row.recruiterName || ''}`.toLowerCase().includes(query.toLowerCase()));

  function openAction(kind, row) {
    setAction({ kind, row });
    setReviewNote('');
    setPaymentReference('');
  }

  async function submitAction(event) {
    event.preventDefault();
    const { kind, row } = action;
    setBusy(row.id);
    setError('');
    try {
      if (kind === 'pay') {
        await client.post(`/referrals/${encodeURIComponent(row.id)}/pay`, { paymentReference: paymentReference.trim() });
      } else if (kind === 'assign') {
        await client.post(`/referrals/${encodeURIComponent(row.id)}/assign-recruiter`, { recruiterId: reviewNote });
      } else {
        await client.patch(`/referrals/${encodeURIComponent(row.id)}/status`, { status: kind, note: reviewNote.trim() });
      }
      setAction(null);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || (kind === 'pay' ? 'Could not record payment.' : kind === 'assign' ? 'Could not assign this web lead.' : 'Status update failed.'));
    } finally {
      setBusy('');
    }
  }

  function exportApplicants() {
    const exportedRows = filteredRows.map((row) => [
      [`${row.applicantName || '—'}`, `Email: ${row.email || '—'}`, `Phone: ${row.phone || '—'}`, `County: ${row.county || '—'}`, `National ID: ${row.applicantIdNumber || '—'}`, `Education: ${row.education || '—'}`, `Passport: ${label(row.passportStatus) || '—'}`, `NITA fee: ${row.nitaFeeStatus === 'paid' ? 'Paid' : 'Unpaid'}`].join('\n'),
      registeredAt(row), sourceLabel(row.source), row.campaignName, recruiterName(row), label(row.status), row.commissionConfigured ? `KSh ${Number(row.commissionAmountKsh).toLocaleString()}` : 'Not configured', label(row.payoutStatus || '—'),
    ]);
    exportPdf('Applicant referral report', ['Applicant details', 'Registered', 'Source', 'Campaign', 'Recruiter', 'Progress', 'Commission', 'Payout status'], exportedRows, { fontSize: 9, headerFontSize: 10, subtitle: `${filteredRows.length} applicant records${sourceFilter ? ` · ${sourceLabel(sourceFilter)}` : ''}${statusFilter ? ` · ${label(statusFilter)}` : ''}${campaignFilter ? ` · ${campaignFilter}` : ''}` });
  }

  function exportActiveRecruiters() {
    const exportedRows = activeRecruiters.map(({ recruiter, id, count }, index) => [
      index + 1,
      recruiter?.name || recruiterNameById[id] || 'Unknown recruiter',
      recruiter?.email || '—',
      recruiter?.phone || '—',
      count,
    ]);
    exportPdf('Most active recruiters', ['Rank', 'Full name', 'Email', 'Phone', 'Active recruitments'], exportedRows, {
      subtitle: `${activeRecruiters.length} recruiters with active applicant recruitments · Rejected referrals excluded`,
      filename: 'brandsphere-most-active-recruiters.pdf',
    });
  }

  async function deleteReferral(row) {
    if (!window.confirm(`Delete ${row.applicantName}'s application? This cannot be undone.`)) return;
    setBusy(row.id); setError('');
    try { await client.delete(`/referrals/${encodeURIComponent(row.id)}`); await load(); }
    catch (requestError) { setError(requestError.response?.data?.error?.message || 'Could not delete this application.'); }
    finally { setBusy(''); }
  }

  return <>
    <div className="page-heading"><span className="eyebrow">JOBPLUS · CANDIDATE RECRUITMENT</span><h1>Applicant referrals</h1><p className="muted">Review recruiter submissions, track progress, and record commission payments against the configured campaign rule.</p></div>
    {error && <div className="error-banner" role="alert">{error}<Button type="button" variant="secondary" onClick={load} disabled={loading}>{loading ? 'Retrying…' : 'Retry'}</Button></div>}
    <div className="grid-4 referral-summary-grid">
      {[['Applicants', summary?.total || 0], ['In progress', (summary?.counts?.submitted || 0) + (summary?.counts?.contacted || 0)], ['Placed', summary?.counts?.placed || 0], ['Commission due', `KSh ${(summary?.dueKsh || 0).toLocaleString()}`]].map(([title, value]) => <Card key={title}><small className="muted">{title}</small><div className="stat-value">{value}</div></Card>)}
    </div>
    {summary?.commissionRuleMissing && <div className="error-banner">At least one recruitment campaign has no commission rule. Configure a rate and trigger in Campaigns before promising or paying recruiter commission.</div>}
    <Card title={loading ? 'Loading applicants…' : `${filteredRows.length} applicant records`}>
      <div className="referral-toolbar"><label>Search<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Applicant, phone, campaign, or recruiter" /></label><label>Source<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="">All sources</option><option value="web_ad">Web ad leads</option><option value="web_engagement">Online engagement</option><option value="recruiter_app">Recruiter app</option></select></label><label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label><label>Campaign<select value={campaignFilter} onChange={(event) => setCampaignFilter(event.target.value)}><option value="">All campaigns</option>{campaigns.map((campaign) => <option key={campaign} value={campaign}>{campaign}</option>)}</select></label><Button type="button" variant="secondary" disabled={loading || !filteredRows.length} onClick={exportApplicants}>Export PDF</Button><Button type="button" variant="secondary" disabled={loading || !activeRecruiters.length} onClick={exportActiveRecruiters}>Most active recruiters PDF</Button></div>
      {loading && !rows.length ? <div className="table-loading" role="status">Loading referrals…</div> : filteredRows.length ? <div className="table-wrap"><table className="referral-table"><thead><tr><th>Applicant</th><th>Registered</th><th>Source</th><th>Campaign</th><th>Recruiter</th><th>Candidate details</th><th>Progress</th><th>Commission</th><th>Action</th></tr></thead><tbody>{filteredRows.map((row) => {
        const nextStatus = statuses[statuses.indexOf(row.status) + 1];
        return <tr key={row.id}>
          <td><strong>{row.applicantName}</strong><br /><small className="muted">{row.county}</small></td><td><time dateTime={referralDate(row.createdAt)?.toISOString()}>{registeredAt(row)}</time></td>
          <td><span className={`source-pill ${['web_ad', 'web_engagement'].includes(row.source) ? 'source-web' : 'source-app'}`}>{sourceLabel(row.source)}</span></td><td>{row.campaignName}</td><td>{recruiterName(row)}</td>
          <td><details className="referral-details"><summary>View details</summary><dl><dt>Phone</dt><dd>{row.phone || '—'}</dd><dt>Email</dt><dd>{row.email || '—'}</dd><dt>National ID</dt><dd>{row.applicantIdNumber || '—'}</dd><dt>Education</dt><dd>{row.education || '—'}</dd><dt>Passport</dt><dd>{label(row.passportStatus) || '—'}</dd><dt>NITA fee</dt><dd>{row.nitaFeeStatus === 'paid' ? 'Paid' : 'Unpaid'}</dd></dl></details></td>
          <td><span className={`status-pill ${row.status === 'placed' ? 'status-good' : row.status === 'rejected' ? 'status-risk' : 'status-watch'}`}>{label(row.status)}</span></td>
          <td>{row.commissionConfigured ? `KSh ${Number(row.commissionAmountKsh).toLocaleString()} · ${label(row.payoutStatus)}` : 'Not configured'}</td>
          <td><div className="row-actions">{isUnclaimedWebLead(row) ? <Button disabled={busy === row.id} onClick={() => openAction('assign', row)}>Assign recruiter</Button> : row.payoutStatus === 'due' ? <Button disabled={busy === row.id} onClick={() => openAction('pay', row)}>Record payment</Button> : nextStatus && row.status !== 'rejected' ? <Button variant="secondary" disabled={busy === row.id} onClick={() => openAction(nextStatus, row)}>Move to {label(nextStatus)}</Button> : row.status === 'rejected' ? 'Closed' : row.status === 'placed' ? 'Complete' : '—'}<Button variant="danger" disabled={busy === row.id} onClick={() => deleteReferral(row)}>Delete</Button></div></td>
        </tr>;
      })}</tbody></table></div> : !loading ? <div className="empty-state"><strong>{rows.length ? 'No matching referrals' : 'No registrations yet'}</strong><span>{rows.length ? 'Adjust the search or filters.' : 'Recruiter submissions will appear here.'}</span></div> : null}
    </Card>
    {action && <div className="command-backdrop" role="presentation" onMouseDown={() => setAction(null)}><section className="ui-card referral-action-dialog" role="dialog" aria-modal="true" aria-labelledby="referral-action-title" onMouseDown={(event) => event.stopPropagation()}><div className="ui-card-heading"><h2 id="referral-action-title">{action.kind === 'pay' ? 'Record recruiter payment' : action.kind === 'assign' ? 'Assign web lead to recruiter' : `Move applicant to ${label(action.kind)}`}</h2><button className="dialog-close" type="button" aria-label="Close" onClick={() => setAction(null)}>×</button></div><p className="muted">{action.row.applicantName} · {action.row.campaignName}</p><form className="form-grid" onSubmit={submitAction}>{action.kind === 'pay' ? <div className="field"><label htmlFor="referral-payment-reference">Transfer or payment reference</label><input id="referral-payment-reference" required maxLength={120} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></div> : action.kind === 'assign' ? <div className="field"><label htmlFor="referral-recruiter">Recruiter</label><select id="referral-recruiter" required value={reviewNote} onChange={(event) => setReviewNote(event.target.value)}><option value="">Choose a recruiter</option>{reps.filter((rep) => rep.role === 'recruiter' && rep.active !== false).map((rep) => <option key={rep.id} value={rep.id}>{rep.name}</option>)}</select><small className="muted">Only recruiters assigned to this campaign (or its team) can receive this application.</small></div> : <div className="field"><label htmlFor="referral-review-note">Review note (optional)</label><textarea id="referral-review-note" rows={4} maxLength={500} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></div>}{error && <div className="error-banner" role="alert">{error}</div>}<div className="dialog-actions"><Button type="button" variant="secondary" onClick={() => setAction(null)}>Cancel</Button><Button type="submit" disabled={busy === action.row.id}>{busy === action.row.id ? 'Saving…' : action.kind === 'pay' ? 'Record payment' : action.kind === 'assign' ? 'Assign recruiter' : 'Update status'}</Button></div></form></section></div>}
  </>;
}
