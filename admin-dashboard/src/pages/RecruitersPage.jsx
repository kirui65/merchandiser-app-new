import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';

const blank = { name: '', phone: '', email: '', password: '' };

export default function RecruitersPage() {
  const [form, setForm] = useState(blank);
  const [recruiters, setRecruiters] = useState([]);
  const [teams, setTeams] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [repResponse, teamResponse, membershipResponse, campaignResponse] = await Promise.all([
        client.get('/reps'),
        client.get('/teams'),
        client.get('/teams/memberships'),
        client.get('/campaigns'),
      ]);
      setRecruiters((repResponse.data.reps || []).filter((user) => user.role === 'recruiter' && user.active !== false));
      setTeams((teamResponse.data.teams || []).filter((team) => team.active));
      setMemberships(membershipResponse.data.memberships || []);
      setCampaigns((campaignResponse.data.campaigns || []).filter((campaign) => campaign.programType === 'candidate_recruitment'));
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Could not load recruiter setup data.');
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const currentMembership = (userId) => memberships.find((item) => item.repId === userId && item.status === 'active');

  async function create(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    let created;
    try {
      const response = await client.post('/reps', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: 'recruiter',
      });
      created = response.data?.rep;
      if (!created?.id) throw new Error('The server did not return the created account. Check the recruiter list before trying again.');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || requestError.message || 'Recruiter account creation failed.');
      setSaving(false);
      return;
    }

    setForm(blank);
    setNotice(`${created.name} now has a Campaign Recruiter account.`);

    let followupError = '';
    try {
      await load();
    } catch {
      followupError = `${followupError ? `${followupError} ` : ''}The account was created, but the list could not refresh. Use Refresh to try again.`;
    }
    if (followupError) setError(followupError);
    setSaving(false);
  }

  async function saveEdit(event) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      await client.put(`/reps/${editing.id}`, { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim().toLowerCase(), role: 'recruiter', ...(form.password ? { password: form.password } : {}) });
      setEditing(null); setForm(blank); setNotice('Recruiter account updated.'); await load();
    } catch (requestError) { setError(requestError.response?.data?.error?.message || 'Could not update recruiter account.'); }
    finally { setSaving(false); }
  }

  async function deleteRecruiter(user) {
    if (!window.confirm(`Permanently delete ${user.name}'s recruiter account?`)) return;
    setSaving(true); setError('');
    try { await client.delete(`/reps/${user.id}`); setNotice('Recruiter account deleted.'); await load(); }
    catch (requestError) { setError(requestError.response?.data?.error?.message || 'Could not delete recruiter account.'); }
    finally { setSaving(false); }
  }

  function generatePassword() {
    const value = `Bs-${crypto.getRandomValues(new Uint32Array(2)).reduce((text, part) => text + part.toString(36), '')}`.slice(0, 22);
    setForm((current) => ({ ...current, password: value }));
    setShowPassword(true);
  }

  async function copyPassword() {
    try { await navigator.clipboard.writeText(form.password); setNotice('New password copied. Save the account edit to apply it.'); }
    catch { setError('Could not copy the password. Select and copy it manually.'); }
  }

  return <>
    <div className="page-heading">
      <span className="eyebrow">CAMPAIGN OPERATIONS</span>
      <h1>Recruiter accounts</h1>
      <p className="muted">Create recruiter logins here, then assign each person directly from a recruitment campaign. Team assignment is optional.</p>
    </div>
    {error ? <div className="error-banner" role="alert">{error}</div> : null}
    {notice ? <div className="success-banner" role="status">{notice}</div> : null}
    <div className="grid-2">
      <Card title={editing ? `Edit ${editing.name}` : 'Create campaign recruiter'}>
        <form className="form-grid" onSubmit={editing ? saveEdit : create}>
          <div className="field"><label>Full name</label><input required maxLength={160} autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
          <div className="field"><label>Phone</label><input required type="tel" autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div>
          <div className="field"><label>Email (sign-in)</label><input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
          <div className="field"><label>{editing ? 'New password (optional)' : 'Temporary password'}</label><input required={!editing} minLength={8} type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><div className="dialog-actions"><Button type="button" variant="secondary" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide password' : 'Show password'}</Button><Button type="button" variant="secondary" onClick={generatePassword}>Generate password</Button>{form.password && <Button type="button" variant="secondary" onClick={copyPassword}>Copy password</Button>}</div><small className="muted">{editing ? 'Existing passwords cannot be displayed. Leave this blank to keep it, or set and save a new password to replace it.' : 'Share this securely with the recruiter.'}</small></div>
          <div className="dialog-actions"><Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save account' : 'Create recruiter account'}</Button>{editing && <Button variant="secondary" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</Button>}</div>
        </form>
      </Card>
      <Card title="Setup steps">
        <ol style={{ lineHeight: 1.8, paddingLeft: 22 }}>
          <li>Create a recruiter account here.</li>
          <li>Open Campaigns, choose Candidate Recruitment, then select the recruiter under Assign recruiters.</li>
          <li>Share sign-in details securely. The recruiter sees the campaign in the app and can register applicants.</li>
        </ol>
        <p className="muted">Team membership is only needed when a team leader should also review the recruiter’s applicants.</p>
      </Card>
    </div>
    <Card title={`${recruiters.length} active campaign recruiters`}>
      <div className="ui-card-heading">
        <span className="muted">{loading ? 'Refreshing recruiter accounts…' : 'Account status and team assignment'}</span>
        <Button type="button" variant="secondary" onClick={() => load().catch(() => {})} disabled={loading || saving}>{loading ? 'Refreshing…' : 'Refresh'}</Button>
      </div>
      {recruiters.length ? <div className="table-wrap"><table>
        <thead><tr><th>Recruiter</th><th>Sign-in email</th><th>Phone</th><th>Team (optional)</th><th>Assigned campaigns</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{recruiters.map((user) => {
          const membership = currentMembership(user.id);
          const team = teams.find((item) => item.id === membership?.teamId);
          const assignedCampaigns = campaigns.filter((campaign) => campaign.recruiterIds?.includes(user.id)
            || (team && campaign.teamIds?.includes(team.id)));
          return <tr key={user.id}>
            <td>{user.name}</td><td>{user.email}</td><td>{user.phone}</td>
            <td>{team?.name || (membership ? 'Assigned team unavailable' : 'Not assigned')}</td>
            <td>{assignedCampaigns.length ? <div className="assigned-campaign-list">{assignedCampaigns.map((campaign) => <span className="status-pill" key={campaign.id}>{campaign.name}</span>)}</div> : <span className="muted">No campaigns assigned</span>}</td>
            <td>{assignedCampaigns.length ? 'Ready' : 'Campaign needed'}</td><td><div className="row-actions"><Button variant="secondary" onClick={() => { setEditing(user); setShowPassword(false); setForm({ name: user.name || '', phone: user.phone || '', email: user.email || '', password: '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</Button><Button variant="danger" onClick={() => deleteRecruiter(user)}>Delete</Button></div></td>
          </tr>;
        })}</tbody>
      </table></div> : !loading ? <EmptyState title="No recruiter accounts yet" message="Create an account above for each person recruiting campaign applicants." /> : null}
    </Card>
  </>;
}
