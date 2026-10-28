import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function LoginPage() {
  const { signIn, verifyMfa } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(searchParams.get('role') || 'recruiter');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState(null);
  const [mfaCode, setMfaCode] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn(email, password, role);
      if (result.mfaRequired) { setMfaChallenge(result.challenge); setPassword(''); return; }
      navigate(searchParams.get('returnTo') || (result.role === 'recruiter' ? '/recruiter-portal' : '/'));
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMfaSubmit(event) {
    event.preventDefault(); setError(null); setSubmitting(true);
    try { const user = await verifyMfa(mfaChallenge, mfaCode); navigate(searchParams.get('returnTo') || (user.role === 'recruiter' ? '/recruiter-portal' : '/')); }
    catch (err) { setError(err?.response?.data?.error?.message || err.message || 'Authenticator verification failed'); }
    finally { setSubmitting(false); }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-brand"><img src="/brandsphere-wordmark.png" alt="Brandsphere Marketing Agency" /></div>
        <div className="login-hero"><span className="login-kicker">Secure staff access</span><h1>Field work, clearly connected.</h1><p>Sign in to the manager workspace or your recruiter portal from any supported device.</p></div>
        <div className="login-proof"><span><strong>Field-first</strong>Route & outlet intelligence</span><span><strong>Money-aware</strong>M-Pesa reconciliation</span><span><strong>Accountable</strong>Team audit history</span></div>
      </section>
      <section className="login-panel"><div className="login-card"><span className="eyebrow">Secure access</span><h1>{mfaChallenge ? 'Verify it’s you' : 'Welcome back'}</h1><p>{mfaChallenge ? 'Enter the current code from your authenticator app.' : 'Choose your staff role, then sign in.'}</p><form className="form-grid" onSubmit={mfaChallenge ? handleMfaSubmit : handleSubmit}>{mfaChallenge ? <div className="field"><label htmlFor="mfa-code">Authenticator code</label><input id="mfa-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" placeholder="6-digit code" required value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></div> : <><div className="field"><label htmlFor="role">Staff role</label><select id="role" value={role} onChange={(e) => setRole(e.target.value)}><option value="recruiter">Campaign recruiter</option><option value="manager">Admin</option><option value="rep">Merchandiser</option><option value="brand_ambassador">Brand ambassador</option><option value="telemarketer">Telemarketer</option><option value="team_leader">Team leader</option></select></div><div className="field"><label htmlFor="email">Work email</label><input id="email" autoComplete="email" type="email" placeholder="you@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} /></div><div className="field"><label htmlFor="password">Password</label><input id="password" autoComplete="current-password" placeholder="Enter your password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div></>}{error && <div className="error-banner">{error}</div>}<button className="ui-button ui-button-primary" disabled={submitting} type="submit">{submitting ? 'Verifying…' : mfaChallenge ? 'Verify and continue' : 'Sign in'}</button>{mfaChallenge && <button className="ui-button ui-button-secondary" type="button" onClick={() => { setMfaChallenge(null); setMfaCode(''); setError(null); }}>Back to sign in</button>}</form><p className="login-help">Use Campaign recruiter for the recruiter portal or Admin for the manager dashboard. Other role selections use the same backend role check but are not yet supported in this web workspace.</p></div></section>
    </main>
  );
}
