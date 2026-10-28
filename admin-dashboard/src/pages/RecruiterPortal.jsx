import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';
import Button from '../components/Button';
import Card from '../components/Card';
import ApplicantFields from '../components/ApplicantFields';
import { useAuth } from '../auth/AuthContext';

const empty = { campaignId: '', applicantName: '', applicantIdNumber: '', phone: '', email: '', county: '', education: '', passportStatus: '', nitaFeeStatus: '' };
const title = (value) => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());

export default function RecruiterPortal() {
  const { user, signOut } = useAuth();
  const [view, setView] = useState('home');
  const [campaigns, setCampaigns] = useState([]); const [rows, setRows] = useState([]); const [summary, setSummary] = useState(null);
  const [form, setForm] = useState(empty); const [consent, setConsent] = useState(false); const [editing, setEditing] = useState(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [saving, setSaving] = useState(false); const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [campaignResponse, referralResponse, summaryResponse] = await Promise.all([client.get('/referrals/campaigns/available'), client.get('/referrals'), client.get('/referrals/summary')]);
      const available = campaignResponse.data.campaigns || [];
      setCampaigns(available); setRows(referralResponse.data.referrals || []); setSummary(summaryResponse.data.summary || null);
      setForm((current) => ({ ...current, campaignId: current.campaignId || available[0]?.id || '' })); setError('');
    } catch (requestError) { setError(requestError.response?.data?.error?.message || 'Could not refresh your recruiter hub. Check your connection and try again.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  function openNew() { setEditing(null); setForm({ ...empty, campaignId: campaigns[0]?.id || '' }); setConsent(false); setView('new'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function edit(row) { setEditing(row); setForm({ ...empty, ...row }); setConsent(true); setView('new'); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  async function submit(event) {
    event.preventDefault(); setError(''); setNotice('');
    if (!consent) { setError('Confirm the applicant’s consent before submitting.'); return; }
    setSaving(true);
    try {
      const payload = { ...form, applicantName: form.applicantName.trim(), applicantIdNumber: form.applicantIdNumber.trim(), phone: form.phone.trim(), email: form.email.trim().toLowerCase(), county: form.county.trim(), eligibleForWomenOnlyIntake: true, applicantConsent: true };
      if (editing) { const { campaignId, eligibleForWomenOnlyIntake, applicantConsent, ...changes } = payload; await client.patch(`/referrals/${editing.id}`, changes); }
      else await client.post('/referrals', payload);
      setNotice(editing ? 'Applicant details updated.' : 'Applicant registered successfully.'); setForm({ ...empty, campaignId: campaigns[0]?.id || '' }); setConsent(false); setEditing(null); setView('applicants'); await load();
    } catch (requestError) { setError(requestError.response?.data?.error?.message || 'Could not save the applicant details.'); }
    finally { setSaving(false); }
  }

  const inProgress = (summary?.counts?.submitted || 0) + (summary?.counts?.contacted || 0) + (summary?.counts?.requirements_checked || 0) + (summary?.counts?.training_scheduled || 0);
  return <main className="recruiter-portal">
    <header className="recruiter-header"><div><span className="recruiter-kicker">JOBPLUS INTERNATIONAL</span><h1>Recruiter hub</h1></div><div><strong>{user?.name}</strong><Button variant="secondary" onClick={signOut}>Sign out</Button></div></header>
    <nav className="recruiter-tabs" aria-label="Recruiter portal"><button className={view === 'home' ? 'is-active' : ''} onClick={() => setView('home')}>Home</button><button className={view === 'new' ? 'is-active' : ''} onClick={openNew}>Register applicant</button><button className={view === 'applicants' ? 'is-active' : ''} onClick={() => setView('applicants')}>My applicants</button></nav>
    {error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="success-banner" role="status">{notice}</div>}
    {view === 'home' && <>
      <section className="recruiter-hero"><span>SAUDI ARABIA · HOMECARE</span><h2>A clear path from referral to placement.</h2><p>Register interested applicants, then follow each referral through review and training.</p><Button onClick={openNew}>Register applicant <span aria-hidden="true">→</span></Button></section>
      <div className="recruiter-stats">{[['Registered', summary?.total || 0], ['In progress', inProgress], ['Placed', summary?.counts?.placed || 0], ['Commission due', `KSh ${Number(summary?.dueKsh || 0).toLocaleString()}`], ['Paid', `KSh ${Number(summary?.paidKsh || 0).toLocaleString()}`]].map(([label, value]) => <div className="recruiter-stat" key={label}><strong>{loading ? '…' : value}</strong><span>{label}</span></div>)}</div>
      <Card title="Campaign guide"><p className="muted">Register interested applicants, confirm consent, and keep their phone number accurate so duplicate registrations are prevented. Managers will update the review and placement status.</p><p className="muted">Applicants should be women with KCPE or KCSE. Ask your manager about campaign requirements and the separate recruiter commission terms.</p></Card>
      <Card title="Active campaigns"><div className="recruiter-campaigns">{campaigns.length ? campaigns.map((campaign) => <div className="recruiter-campaign" key={campaign.id}><strong>{campaign.name}</strong><span>{campaign.clientName || 'Recruitment campaign'} · {campaign.referralCommissionKsh ? `KSh ${Number(campaign.referralCommissionKsh).toLocaleString()} commission` : 'Commission not configured'}</span></div>) : <p className="muted">No active recruitment campaign is assigned to your account yet. Ask your manager to select you under Assign recruiters in Campaigns.</p>}</div></Card>
    </>}
    {view === 'new' && <Card title={editing ? `Edit ${editing.applicantName}` : 'Register applicant'}><form className="form-grid" onSubmit={submit}><div className="field"><label>Campaign</label><select required value={form.campaignId} onChange={(event) => update('campaignId', event.target.value)}><option value="">Select campaign</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></div><ApplicantFields form={form} update={update} className="field" /><label className="consent-check"><input required type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> The applicant confirms she is an adult woman and consents to sharing her ID, contact, education, and campaign details for recruitment.</label><div className="dialog-actions"><Button type="button" variant="secondary" onClick={() => setView('home')}>Cancel</Button><Button type="submit" disabled={saving || !campaigns.length}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Submit registration'}</Button></div></form></Card>}
    {view === 'applicants' && <Card title="My applicants"><div className="ui-card-heading"><span className="muted">{rows.length} registrations · Only your applicants are shown</span><Button type="button" variant="secondary" onClick={openNew}>＋ Register applicant</Button></div>{rows.length ? <div className="recruiter-applicant-list">{rows.map((row) => <article className="recruiter-applicant" key={row.id}><div><strong>{row.applicantName || 'Applicant'}</strong><span>{row.phone} · {row.county}</span><small>{row.campaignName}</small></div><span className="status-pill">{title(row.status)}</span>{row.status === 'submitted' && <Button variant="secondary" onClick={() => edit(row)}>Edit</Button>}</article>)}</div> : <p className="muted">No applicants yet. Register your first applicant to start tracking progress.</p>}</Card>}
  </main>;
}
