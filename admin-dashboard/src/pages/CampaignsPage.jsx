import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import { businessDateKey } from '../utils/businessDate';
import { exportApplicantPaperForm } from '../utils/export';

const emptyForm = {
  clientName: '',
  name: '',
  description: '',
  publicSlug: '',
  regionIds: [],
  teamIds: [],
  status: 'draft',
  programType: 'field_sales',
  referralCommissionKsh: '',
  referralCommissionAt: 'placed',
  recruiterIds: [],
  startsAt: businessDateKey(),
  endsAt: '',
};

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

function statusClass(status) {
  if (status === 'active') return 'status-good';
  if (status === 'paused' || status === 'draft') return 'status-watch';
  if (status === 'archived') return 'status-risk';
  return '';
}

function readable(value) {
  return String(value || '').replaceAll('_', ' ');
}

function campaignAdUrl(campaign) {
  if (!campaign?.publicSlug) return '';
  return `${window.location.origin}/apply?campaign=${encodeURIComponent(campaign.publicSlug)}`;
}

function AdLinkActions({ campaign, compact = false, paperForm = false }) {
  const [copied, setCopied] = useState(false);
  const link = campaignAdUrl(campaign);
  const ready = campaign?.programType === 'candidate_recruitment' && campaign?.status === 'active' && Boolean(link);
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this application link', link);
    }
  };
  if (compact) return ready ? <button className="table-link-button" type="button" onClick={copy}>{copied ? 'Copied' : 'Copy ad link'}</button> : <span className="muted">{link ? 'Not ready' : 'No link'}</span>;
  return <div className="ad-link-actions">
    <Button type="button" onClick={copy} disabled={!ready}>{copied ? 'Copied!' : 'Copy ad link'}</Button>
    <Button type="button" variant="secondary" onClick={() => window.open(link, '_blank', 'noopener,noreferrer')} disabled={!ready}>Preview application</Button>
    {navigator.share ? <Button type="button" variant="secondary" onClick={() => navigator.share({ title: campaign.name, text: `Apply for ${campaign.name}`, url: link })} disabled={!ready}>Share</Button> : null}
    {paperForm ? <Button type="button" variant="secondary" onClick={() => exportApplicantPaperForm(campaign)} disabled={!ready}>Download paper form (PDF)</Button> : null}
  </div>;
}

function dateInput(value) {
  if (!value) return '';
  const timestamp = typeof value === 'object' ? (value.seconds ?? value._seconds) * 1000 : value;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : businessDateKey(date);
}

function toPayload(form) {
  return {
    ...form,
    referralCommissionKsh: form.programType === 'candidate_recruitment' && form.referralCommissionKsh !== '' ? Number(form.referralCommissionKsh) : null,
    referralCommissionAt: form.programType === 'candidate_recruitment' ? form.referralCommissionAt : null,
    recruiterIds: form.programType === 'candidate_recruitment' ? [...new Set(form.recruiterIds)] : [],
    publicSlug: form.programType === 'candidate_recruitment' && form.publicSlug.trim() ? form.publicSlug.trim().toLowerCase() : null,
    startsAt: new Date(`${form.startsAt}T00:00:00.000+03:00`).toISOString(),
    endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59.999+03:00`).toISOString() : null,
  };
}

function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pickerRef = useRef(null);
  const labelId = `campaign-${label.toLowerCase()}-label`;
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!pickerRef.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  const chosen = options.filter((option) => selected.includes(option.id));
  const visible = options.filter((option) => option.name.toLowerCase().includes(query.toLowerCase()));
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  return <div className="field assignment-picker" ref={pickerRef}>
    <label id={labelId}>{label}</label>
    <button type="button" className="recruiter-picker-trigger" aria-labelledby={labelId} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span className={chosen.length ? '' : 'is-placeholder'}>{chosen.length ? chosen.map((item) => item.name).join(', ') : `Select ${label.toLowerCase()}`}</span>
      <span className="recruiter-picker-count">{chosen.length || ''}</span><span className="recruiter-picker-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div className="recruiter-picker-menu" role="menu" aria-labelledby={labelId}>
      {options.length > 6 && <input className="recruiter-picker-search" aria-label={`Search ${label.toLowerCase()}`} autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}…`} />}
      <div className="recruiter-picker-options">{visible.map((option) => { const isSelected = selected.includes(option.id); return <button key={option.id} type="button" role="menuitemcheckbox" aria-checked={isSelected} className={`recruiter-picker-option ${isSelected ? 'is-selected' : ''}`} onClick={() => toggle(option.id)}><span className="recruiter-picker-option-copy"><strong>{option.name}</strong>{option.countryCode && <small>{option.countryCode}</small>}</span><span className="recruiter-picker-check" aria-hidden="true">{isSelected ? '✓' : ''}</span></button>; })}{!visible.length && <p className="recruiter-picker-empty">No matches.</p>}</div>
      <div className="recruiter-picker-footer">{chosen.length} selected · Choose one or more</div>
    </div>}
    {chosen.length > 0 && <div className="recruiter-picker-tags">{chosen.map((option) => <span key={option.id}>{option.name}<button type="button" aria-label={`Remove ${option.name}`} onClick={() => toggle(option.id)}>×</button></span>)}</div>}
  </div>;
}

function RecruiterPicker({ recruiters, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pickerRef = useRef(null);
  const toggle = (recruiterId) => onChange(
    selected.includes(recruiterId)
      ? selected.filter((id) => id !== recruiterId)
      : [...selected, recruiterId],
  );
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => { if (!pickerRef.current?.contains(event.target)) setOpen(false); };
    const closeOnEscape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);
  const selectedRecruiters = recruiters.filter((recruiter) => selected.includes(recruiter.id));
  const filteredRecruiters = recruiters.filter((recruiter) => `${recruiter.name} ${recruiter.email}`.toLowerCase().includes(query.toLowerCase()));
  const summary = selectedRecruiters.length
    ? selectedRecruiters.map((recruiter) => recruiter.name).join(', ')
    : 'Select recruiters';
  return <div className="field recruiter-picker" ref={pickerRef}>
    <label id="recruiter-picker-label">Assign recruiters</label>
    <small className="muted">Choose who can register applicants for this campaign.</small>
    {recruiters.length ? <>
      <button type="button" className="recruiter-picker-trigger" aria-labelledby="recruiter-picker-label" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className={selectedRecruiters.length ? '' : 'is-placeholder'}>{summary}</span>
        <span className="recruiter-picker-count">{selectedRecruiters.length ? selectedRecruiters.length : ''}</span>
        <span className="recruiter-picker-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && <div className="recruiter-picker-menu" role="menu" aria-labelledby="recruiter-picker-label">
        {recruiters.length > 6 && <input className="recruiter-picker-search" aria-label="Search recruiters" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search recruiters…" />}
        <div className="recruiter-picker-options">
          {filteredRecruiters.map((recruiter) => {
            const isSelected = selected.includes(recruiter.id);
            return <button key={recruiter.id} type="button" role="menuitemcheckbox" aria-checked={isSelected} className={`recruiter-picker-option ${isSelected ? 'is-selected' : ''}`} onClick={() => toggle(recruiter.id)}>
              <span className="recruiter-picker-option-copy"><strong>{recruiter.name}</strong><small>{recruiter.email}</small></span>
              <span className="recruiter-picker-check" aria-hidden="true">{isSelected ? '✓' : ''}</span>
            </button>;
          })}
          {!filteredRecruiters.length && <p className="recruiter-picker-empty">No recruiters match that search.</p>}
        </div>
        <div className="recruiter-picker-footer">{selectedRecruiters.length} selected · Choose one or more</div>
      </div>}
    </> : <p className="muted">No active recruiter accounts yet. <Link to="/recruiters">Create a recruiter account</Link> first.</p>}
    {selectedRecruiters.length > 0 && <div className="recruiter-picker-tags" aria-label="Selected recruiters">{selectedRecruiters.map((recruiter) => <span key={recruiter.id}>{recruiter.name}<button type="button" aria-label={`Remove ${recruiter.name}`} onClick={() => toggle(recruiter.id)}>×</button></span>)}</div>}
  </div>;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [teams, setTeams] = useState([]);
  const [regions, setRegions] = useState([]);
  const [recruiters, setRecruiters] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [adCampaignId, setAdCampaignId] = useState('');

  const load = useCallback(async () => {
    const [campaignResponse, teamResponse, regionResponse, repResponse] = await Promise.all([
      client.get('/campaigns'),
      client.get('/teams'),
      client.get('/teams/regions'),
      client.get('/reps'),
    ]);
    setCampaigns(campaignResponse.data.campaigns || []);
    setTeams((teamResponse.data.teams || []).filter((team) => team.active));
    setRegions((regionResponse.data.regions || []).filter((region) => region.active));
    setRecruiters((repResponse.data.reps || []).filter((user) => user.role === 'recruiter' && user.active !== false));
  }, []);

  useEffect(() => { load().catch(() => setError('Failed to load campaign administration data')); }, [load]);

  const recruitmentCampaigns = useMemo(() => campaigns.filter((campaign) => campaign.programType === 'candidate_recruitment'), [campaigns]);
  const selectedAdCampaign = recruitmentCampaigns.find((campaign) => campaign.id === adCampaignId) || recruitmentCampaigns[0];
  const visibleCampaigns = useMemo(() => {
    const query = search.trim().toLowerCase();
    return campaigns.filter((campaign) => (
      (!query || `${campaign.name} ${campaign.clientName} ${campaign.description || ''} ${campaign.publicSlug || ''}`.toLowerCase().includes(query))
      && (!statusFilter || campaign.status === statusFilter)
      && (!typeFilter || campaign.programType === typeFilter)
    )).sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'status') return a.status.localeCompare(b.status) || a.name.localeCompare(b.name);
      return new Date(b.startsAt || 0) - new Date(a.startsAt || 0);
    });
  }, [campaigns, search, statusFilter, typeFilter, sortBy]);
  const activeCount = campaigns.filter((campaign) => campaign.status === 'active').length;
  const readyAdCount = recruitmentCampaigns.filter((campaign) => campaign.status === 'active' && campaign.publicSlug).length;

  async function submit(event) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = toPayload(form);
      if (editing) await client.patch(`/campaigns/${editing.id}`, payload);
      else await client.post('/campaigns', payload);
      setForm(emptyForm);
      setEditing(null);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to save campaign');
    } finally {
      setSaving(false);
    }
  }

  function editCampaign(campaign) {
    setEditing(campaign);
    setForm({
      clientName: campaign.clientName,
      name: campaign.name,
      description: campaign.description || '',
      publicSlug: campaign.publicSlug || '',
      regionIds: campaign.regionIds || [],
      teamIds: campaign.teamIds || [],
      status: campaign.status,
      programType: campaign.programType || 'field_sales',
      referralCommissionKsh: campaign.referralCommissionKsh ?? '',
      referralCommissionAt: campaign.referralCommissionAt || 'placed',
      recruiterIds: campaign.recruiterIds || [],
      startsAt: dateInput(campaign.startsAt),
      endsAt: dateInput(campaign.endsAt),
    });
  }

  async function archive(campaign) {
    if (!window.confirm(`Archive “${campaign.name}”?`)) return;
    setError(null);
    try {
      await client.delete(`/campaigns/${campaign.id}`);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to archive campaign');
    }
  }

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">CLIENT DELIVERY</span>
        <h1>Campaigns</h1>
        <p className="muted">Set campaign schedules. Assign recruitment campaigns directly to recruiter accounts; assign field campaigns to regions and teams.</p>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <section className="campaign-summary" aria-label="Campaign overview">
        <div><strong>{campaigns.length}</strong><span>Total campaigns</span></div>
        <div><strong>{activeCount}</strong><span>Currently active</span></div>
        <div><strong>{recruitmentCampaigns.length}</strong><span>Recruitment campaigns</span></div>
        <div><strong>{readyAdCount}</strong><span>Ad links ready</span></div>
      </section>
      <Card className="ad-link-card" title="Recruitment campaign materials">
        {recruitmentCampaigns.length ? <div className="ad-link-generator">
          <div className="field"><label htmlFor="ad-link-campaign">Recruitment campaign</label><select id="ad-link-campaign" value={adCampaignId || selectedAdCampaign?.id || ''} onChange={(event) => setAdCampaignId(event.target.value)}>{recruitmentCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name} · {readable(campaign.status)}</option>)}</select></div>
          <div className="ad-link-preview"><span>Application URL</span><code>{campaignAdUrl(selectedAdCampaign) || 'Add a public ad campaign slug to generate a link.'}</code><small>{selectedAdCampaign?.status === 'active' && selectedAdCampaign?.publicSlug ? 'Ready to share publicly.' : 'To enable this link, add a slug and set this campaign to Active.'}</small></div>
          <AdLinkActions campaign={selectedAdCampaign} paperForm />
        </div> : <div className="ad-link-empty"><strong>No recruitment campaigns yet.</strong><span>Create a Candidate recruitment campaign below, then assign its public ad slug.</span></div>}
      </Card>
      <Card className="campaign-form-card" title={editing ? `Edit ${editing.name}` : 'Create campaign'}>
        <form className="form-grid" onSubmit={submit}>
          <div className="field"><label>Client</label><input required maxLength={160} value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value })} /></div>
          <div className="field"><label>Campaign name</label><input required maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value, ...(form.programType === 'candidate_recruitment' && !form.publicSlug ? { publicSlug: slugify(event.target.value) } : {}) })} /></div>
          <div className="field"><label>Program type</label><select value={form.programType} onChange={(event) => setForm({ ...form, programType: event.target.value, ...(event.target.value === 'candidate_recruitment' && !form.publicSlug ? { publicSlug: slugify(form.name) } : {}), ...(event.target.value !== 'candidate_recruitment' ? { recruiterIds: [] } : {}) })}><option value="field_sales">Field sales</option><option value="candidate_recruitment">Candidate recruitment</option></select></div>
          {form.programType === 'candidate_recruitment' ? <div className="grid-2"><div className="field"><label>Recruiter commission (KSh)</label><input type="number" min="1" step="1" required value={form.referralCommissionKsh} onChange={(event) => setForm({ ...form, referralCommissionKsh: event.target.value })} /><small className="muted">This is separate from the advertised candidate salary.</small></div><div className="field"><label>Commission becomes due at</label><select value={form.referralCommissionAt} onChange={(event) => setForm({ ...form, referralCommissionAt: event.target.value })}>{[['requirements_checked','Requirements checked'],['training_scheduled','Training scheduled'],['placed','Placement confirmed']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="field"><label>Public ad campaign slug</label><input maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.publicSlug} onChange={(event) => setForm({ ...form, publicSlug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="homecare-oct" /><small className="muted">Suggested from campaign name. Public link: {window.location.origin}/apply?campaign={form.publicSlug || 'your-slug'}</small></div></div> : null}
          <div className="field"><label>Description</label><textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
          {form.programType === 'candidate_recruitment' ? <RecruiterPicker recruiters={recruiters} selected={form.recruiterIds} onChange={(recruiterIds) => setForm({ ...form, recruiterIds })} /> : <div className="grid-2">
            <MultiSelect label="Regions" options={regions} selected={form.regionIds} onChange={(regionIds) => setForm({ ...form, regionIds, teamIds: form.teamIds.filter((teamId) => teams.find((team) => team.id === teamId && regionIds.includes(team.regionId))) })} />
            <MultiSelect label="Teams" options={teams.filter((team) => !form.regionIds.length || form.regionIds.includes(team.regionId))} selected={form.teamIds} onChange={(teamIds) => setForm({ ...form, teamIds })} />
          </div>}
          <div className="grid-2">
            <div className="field"><label>Status</label><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{['draft', 'active', 'paused', 'completed', 'archived'].map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
            <div className="field"><label>Starts</label><input required type="date" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></div>
            <div className="field"><label>Ends (optional)</label><input type="date" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></div>
          </div>
          <div>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save campaign' : 'Create campaign'}</Button>{' '}
            {editing ? <Button type="button" variant="secondary" onClick={() => { setEditing(null); setForm(emptyForm); }}>Cancel</Button> : null}
          </div>
        </form>
      </Card>
      <Card title="Campaign directory">
        <div className="campaign-toolbar">
          <label>Search<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Campaign, client, slug…" /></label>
          <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{['active', 'draft', 'paused', 'completed', 'archived'].map((status) => <option key={status} value={status}>{readable(status)}</option>)}</select></label>
          <label>Program<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">All programs</option><option value="field_sales">Field sales</option><option value="candidate_recruitment">Candidate recruitment</option></select></label>
          <label>Sort<select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="newest">Newest start date</option><option value="name">Campaign name</option><option value="status">Status</option></select></label>
          {(search || statusFilter || typeFilter || sortBy !== 'newest') && <Button type="button" variant="secondary" onClick={() => { setSearch(''); setStatusFilter(''); setTypeFilter(''); setSortBy('newest'); }}>Clear filters</Button>}
          <span className="campaign-result-count">{visibleCampaigns.length} of {campaigns.length} shown</span>
        </div>
        {visibleCampaigns.length ? (
          <div className="table-wrap"><table className="campaign-table"><thead><tr><th>Campaign</th><th>Schedule</th><th>Assignments</th><th>Ad link</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{visibleCampaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td><strong>{campaign.name}</strong><small className="campaign-client">{campaign.clientName} · {campaign.programType === 'candidate_recruitment' ? 'Candidate recruitment' : 'Field sales'}</small>{campaign.description ? <small>{campaign.description}</small> : null}</td>
                <td>{dateInput(campaign.startsAt)} – {dateInput(campaign.endsAt) || 'Ongoing'}</td>
                <td>{campaign.programType === 'candidate_recruitment' ? <>{`${(campaign.recruiterIds || []).length} recruiters`}{campaign.publicSlug ? <><br /><small>Ad: {campaign.publicSlug}</small></> : null}</> : `${(campaign.regionIds || []).length} regions · ${(campaign.teamIds || []).length} teams`}</td>
                <td>{campaign.programType === 'candidate_recruitment' ? <AdLinkActions compact campaign={campaign} /> : <span className="muted">Not applicable</span>}</td>
                <td><span className={`status-pill ${statusClass(campaign.status)}`}>{readable(campaign.status)}</span></td>
                <td><Button variant="secondary" onClick={() => editCampaign(campaign)}>Edit</Button>{' '}{campaign.status !== 'archived' ? <Button variant="secondary" onClick={() => archive(campaign)}>Archive</Button> : null}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : campaigns.length ? <EmptyState title="No campaigns match these filters" message="Try clearing a filter or searching by a different campaign, client, or public ad slug." /> : <EmptyState title="No campaigns yet" message="Create a campaign and assign recruiters, regions, or field teams." />}
      </Card>
    </>
  );
}
