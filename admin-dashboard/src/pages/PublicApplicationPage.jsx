import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://brandsphere-backend-kgvr.onrender.com/api';
const publicClient = axios.create({ baseURL: API_URL, timeout: 75000 });
const educationOptions = [['KCPE', 'KCPE'], ['KCSE', 'KCSE'], ['certificate', 'Certificate'], ['diploma', 'Diploma'], ['degree', 'Degree'], ['postgraduate', 'Postgraduate'], ['other', 'Other higher']];
const passportOptions = [['has_passport', 'I have a passport'], ['will_get_self_funded', 'I will get one myself'], ['not_ready', 'I am not ready yet']];
const nitaOptions = [['not_paid', 'Not paid'], ['paid', 'Paid']];
const initialForm = { applicantName: '', applicantIdNumber: '', phone: '', email: '', county: '', education: '', passportStatus: '', nitaFeeStatus: '', companyWebsite: '' };

function SelectField({ label, value, onChange, options }) {
  return <label className="public-field"><span>{label}</span><select required value={value} onChange={(event) => onChange(event.target.value)}><option value="">Select one</option>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

export default function PublicApplicationPage({ variant = 'application' }) {
  const isEngagementForm = variant === 'engagement';
  const campaignSlug = new URLSearchParams(window.location.search).get('campaign')?.trim().toLowerCase() || '';
  const [campaign, setCampaign] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState(campaignSlug ? 'loading' : 'unavailable');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!campaignSlug) return undefined;
    let active = true;
    publicClient.get(`/public/campaigns/${encodeURIComponent(campaignSlug)}`)
      .then(({ data }) => { if (active) { setCampaign(data.campaign); setState('form'); } })
      .catch(() => active && setState('unavailable'));
    return () => { active = false; };
  }, [campaignSlug]);

  function update(key, value) { setForm((current) => ({ ...current, [key]: value })); }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!consent) { setError('Please confirm your consent before submitting.'); return; }
    setState('saving');
    try {
      await publicClient.post('/public/referrals', {
        ...form,
        applicantName: form.applicantName.trim(),
        applicantIdNumber: form.applicantIdNumber.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        county: form.county.trim(),
        campaignSlug,
        source: isEngagementForm ? 'web_engagement' : 'web_ad',
        eligibleForWomenOnlyIntake: true,
        applicantConsent: true,
      });
      setState('thanks');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'We could not submit your application. Please check your connection and try again.');
      setState('form');
    }
  }

  return <main className="public-application">
    <header className="public-header"><div className="public-brand"><span className="public-brand-mark">J+</span><span>JOBPLUS</span></div><span className="public-header-note">Opportunity starts here</span></header>
    <section className="public-hero"><div className="public-hero-copy"><p className="public-kicker">INTERNATIONAL RECRUITMENT</p><h1>{isEngagementForm ? 'Register interest in this opportunity.' : 'Take the next step toward your future.'}</h1><p>{isEngagementForm ? 'Complete this engagement form with a recruiter, and our recruitment team will review your details.' : 'Submit your details securely and our recruitment team will contact you if your application matches this opportunity.'}</p></div><div className="public-hero-accent" aria-hidden="true"><span>{isEngagementForm ? 'ENGAGE' : 'APPLY'}</span><strong>{isEngagementForm ? 'NOW' : 'NOW'}</strong></div></section>
    <section className="public-card" aria-live="polite">
      {state === 'loading' && <div className="public-state"><div className="public-spinner" /><h2>Loading application…</h2></div>}
      {state === 'unavailable' && <div className="public-state"><h2>This {isEngagementForm ? 'engagement' : 'application'} link is not available</h2><p>Please check the link in the advert or contact the Jobplus team for help.</p></div>}
      {state === 'thanks' && <div className="public-state public-thanks"><div className="public-success-mark">✓</div><p className="public-kicker">{isEngagementForm ? 'ENGAGEMENT RECORDED' : 'APPLICATION RECEIVED'}</p><h2>Thank you, we’ll be in touch.</h2><p>Your details have been received securely. Please keep your phone available for a call from our recruitment team.</p></div>}
      {(state === 'form' || state === 'saving') && <><div className="public-card-heading"><p className="public-kicker">{isEngagementForm ? 'ENGAGEMENT FORM' : 'APPLICATION FORM'}</p><h2>{campaign?.name || 'Apply today'}</h2>{campaign?.description && <p>{campaign.description}</p>}<p className="public-required">All fields are required.</p></div><form onSubmit={submit} noValidate={false}>
        <div className="public-fields">
          <label className="public-field"><span>Full name</span><input required autoComplete="name" maxLength={160} value={form.applicantName} onChange={(event) => update('applicantName', event.target.value)} /></label>
          <label className="public-field"><span>National ID number</span><input required inputMode="numeric" pattern="[0-9]{7,10}" maxLength={10} autoComplete="off" value={form.applicantIdNumber} onChange={(event) => update('applicantIdNumber', event.target.value.replace(/\D/g, ''))} /><small>Digits only. Your information is handled securely.</small></label>
          <label className="public-field"><span>Phone number</span><input required type="tel" autoComplete="tel" maxLength={24} value={form.phone} onChange={(event) => update('phone', event.target.value)} /></label>
          <label className="public-field"><span>Email address</span><input required type="email" autoComplete="email" maxLength={254} value={form.email} onChange={(event) => update('email', event.target.value)} /></label>
          <label className="public-field"><span>County</span><input required autoComplete="address-level1" maxLength={100} value={form.county} onChange={(event) => update('county', event.target.value)} /></label>
          <SelectField label="Highest education completed" value={form.education} onChange={(value) => update('education', value)} options={educationOptions} />
          <SelectField label="Passport readiness" value={form.passportStatus} onChange={(value) => update('passportStatus', value)} options={passportOptions} />
          <SelectField label="NITA fee status" value={form.nitaFeeStatus} onChange={(value) => update('nitaFeeStatus', value)} options={nitaOptions} />
          <div className="public-honeypot" aria-hidden="true"><label>Company website<input tabIndex="-1" autoComplete="off" value={form.companyWebsite} onChange={(event) => update('companyWebsite', event.target.value)} /></label></div>
        </div>
        <label className="public-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I confirm that I am an adult woman and consent to sharing my ID, contact, education, and campaign details for recruitment.</span></label>
        <p className="public-privacy">Your details are used only to assess and contact you about this recruitment opportunity.</p>
        {error && <p className="public-error" role="alert">{error}</p>}
        <button className="public-submit" type="submit" disabled={state === 'saving'}>{state === 'saving' ? 'Submitting…' : isEngagementForm ? 'Submit engagement' : 'Submit application'}</button>
      </form></>}
    </section>
    <footer className="public-footer">© {new Date().getFullYear()} Jobplus. Your information is protected.</footer>
  </main>;
}
