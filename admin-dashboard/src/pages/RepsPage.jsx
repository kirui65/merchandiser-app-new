import React, { useEffect, useState } from 'react';
import client from '../api/client';
import Card from '../components/Card';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { useAuth } from '../auth/AuthContext';

const ROLE_OPTIONS = [
  ['rep', 'Merchandiser'],
  ['brand_ambassador', 'Brand Ambassador'],
  ['telemarketer', 'Telemarketer'],
  ['team_leader', 'Team Leader'],
  ['recruiter', 'Campaign Recruiter'],
  ['manager', 'Manager'],
];
const roleLabel = (role) => ROLE_OPTIONS.find(([value]) => value === role)?.[1] || role;
const emptyForm = { name: '', phone: '', email: '', password: '', role: 'rep' };
const editForm = { name: '', phone: '', email: '', role: 'rep' };

function findDuplicateEmails(reps) {
  const byEmail = new Map();
  for (const rep of reps) {
    const email = rep.email?.trim().toLowerCase();
    if (!email) continue;
    byEmail.set(email, [...(byEmail.get(email) || []), rep]);
  }
  return [...byEmail.entries()].filter(([, matchingReps]) => matchingReps.length > 1);
}

export default function RepsPage() {
  const { user: currentUser } = useAuth();
  const [reps, setReps] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [edit, setEdit] = useState(editForm);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteMfaCode, setDeleteMfaCode] = useState('');
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const { data } = await client.get('/reps');
    setReps(data.reps);
  }

  useEffect(() => {
    load().catch(() => setError('Failed to load reps'));
    client
      .get('/auth/mfa/status')
      .then(({ data }) => setMfaEnabled(data.enabled === true))
      .catch(() => {});
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError(null);
    const normalizedEmail = form.email.trim().toLowerCase();
    if (reps.some((rep) => rep.email?.trim().toLowerCase() === normalizedEmail)) {
      setError('An account already uses this email address');
      return;
    }
    try {
      await client.post('/reps', { ...form, email: normalizedEmail });
      setForm(emptyForm);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to create rep');
    }
  }

  async function saveEdit(event) {
    event.preventDefault();
    try {
      await client.put(`/reps/${editing.id}`, edit);
      setEditing(null);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to update rep');
    }
  }

  async function toggle(rep) {
    try {
      await client.patch(`/reps/${rep.id}/status`, { active: !rep.active });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to update status');
    }
  }

  async function resetPassword(rep) {
    if (!window.confirm(`Generate a new temporary password for ${rep.name}?`)) return;
    try {
      const { data } = await client.post(`/reps/${rep.id}/reset-password`);
      setNotice(`Temporary password for ${rep.name}: ${data.temporaryPassword}`);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to reset password');
    }
  }

  async function resetMfa(rep) {
    if (!window.confirm(`Reset MFA for ${rep.name}? Their sessions will be signed out.`)) return;
    try {
      const { data } = await client.post(`/reps/${rep.id}/reset-mfa`);
      setNotice(data.message);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to reset MFA');
    }
  }

  async function deleteAccount(event) {
    event.preventDefault();
    if (!deleteCandidate) return;
    setDeleting(true);
    setError(null);
    try {
      const { data } = await client.post(`/admin/reps/${deleteCandidate.id}/delete`, {
        confirmEmail: deleteEmail,
        currentPassword: deletePassword,
        ...(mfaEnabled ? { mfaCode: deleteMfaCode } : {}),
      });
      setNotice(data.message);
      setDeleteCandidate(null);
      setDeleteEmail('');
      setDeletePassword('');
      setDeleteMfaCode('');
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  }

  function startEditing(rep) {
    setEditing(rep);
    setEdit({ name: rep.name, phone: rep.phone, email: rep.email, role: rep.role });
  }

  const duplicateEmails = findDuplicateEmails(reps);

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">FIELD NETWORK</span>
        <h1>Representatives</h1>
        <p className="muted">
          Manage access and field coverage without deleting historical records.
        </p>
      </div>
      {notice ? (
        <div className="success-banner" style={{ marginBottom: 18 }}>
          {notice}
        </div>
      ) : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {duplicateEmails.length ? (
        <div className="error-banner" role="alert">
          <strong>Existing duplicate email addresses need review. No accounts were removed.</strong>
          <ul>
            {duplicateEmails.map(([email, matchingReps]) => (
              <li key={email}>
                {email}: {matchingReps.map((rep) => rep.name).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid-2">
        <Card title="Create account">
          <form className="form-grid" onSubmit={submit}>
            {Object.entries(form)
              .filter(([key]) => key !== 'role')
              .map(([key, value]) => (
                <div className="field" key={key}>
                  <label>{key[0].toUpperCase() + key.slice(1)}</label>
                  <input
                    type={
                      key === 'password'
                        ? 'password'
                        : key === 'email'
                          ? 'email'
                          : key === 'phone'
                            ? 'tel'
                            : 'text'
                    }
                    autoComplete={
                      key === 'password'
                        ? 'new-password'
                        : key === 'email'
                          ? 'email'
                          : key === 'phone'
                            ? 'tel'
                            : 'name'
                    }
                    required
                    value={value}
                    onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  />
                </div>
              ))}
            <div className="field">
              <label>Role</label>
              <select
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value })}
              >
                {ROLE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit">Create account</Button>
          </form>
        </Card>
        <Card title={`${reps.length} team members`}>
          {reps.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reps.map((rep) => (
                    <tr key={rep.id}>
                      <td>{rep.name}</td>
                      <td>
                        {rep.email}
                        <br />
                        {rep.phone}
                      </td>
                      <td>{roleLabel(rep.role)}</td>
                      <td>{rep.active ? 'Active' : 'Inactive'}</td>
                      <td>
                        <details className="row-actions">
                          <summary>Actions</summary>
                          <div className="row-actions-menu">
                            <button type="button" onClick={() => startEditing(rep)}>
                              Edit account
                            </button>
                            <button type="button" onClick={() => toggle(rep)}>
                              {rep.active ? 'Deactivate account' : 'Reactivate account'}
                            </button>
                            <button type="button" onClick={() => resetPassword(rep)}>
                              Reset password
                            </button>
                            {rep.mfaEnabled ? (
                              <button type="button" onClick={() => resetMfa(rep)}>
                                Reset MFA
                              </button>
                            ) : null}
                            {rep.id !== currentUser?.id ? (
                              <button
                                type="button"
                                className="is-danger"
                                onClick={() => {
                                  setDeleteCandidate(rep);
                                  setDeleteEmail('');
                                  setDeletePassword('');
                                  setDeleteMfaCode('');
                                }}
                              >
                                Delete account
                              </button>
                            ) : null}
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No representatives"
              message="Create the first field account to get started."
            />
          )}
        </Card>
      </div>
      {editing ? (
        <Card title={`Edit ${editing.name}`}>
          <form className="form-grid" onSubmit={saveEdit}>
            {['name', 'phone', 'email'].map((key) => (
              <div className="field" key={key}>
                <label>{key[0].toUpperCase() + key.slice(1)}</label>
                <input
                  required
                  value={edit[key]}
                  onChange={(event) => setEdit({ ...edit, [key]: event.target.value })}
                />
              </div>
            ))}
            <div className="field">
              <label>Role</label>
              <select
                value={edit.role}
                onChange={(event) => setEdit({ ...edit, role: event.target.value })}
              >
                {ROLE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Button type="submit">Save changes</Button>{' '}
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
      {deleteCandidate ? (
        <div
          role="presentation"
          onMouseDown={() => !deleting && setDeleteCandidate(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(10,18,32,.58)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
          }}
        >
          <section
            className="ui-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            onMouseDown={(event) => event.stopPropagation()}
            style={{ width: 'min(520px, 100%)', padding: 24 }}
          >
            <span className="eyebrow">PERMANENT ACCOUNT REMOVAL</span>
            <h2 id="delete-account-title">Delete {deleteCandidate.name}?</h2>
            <p className="muted">
              This removes their login and profile. Historical sales, referrals, and audit
              attribution remain under the account ID. Active team memberships will be ended.
              Reassign a team leader’s teams first.
            </p>
            <form className="form-grid" onSubmit={deleteAccount}>
              <div className="field">
                <label>Type this account’s email to confirm</label>
                <input
                  autoComplete="off"
                  required
                  value={deleteEmail}
                  onChange={(event) => setDeleteEmail(event.target.value)}
                />
              </div>
              <div className="field">
                <label>Your current manager password</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                />
              </div>
              {mfaEnabled ? (
                <div className="field">
                  <label>Your authenticator code</label>
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={deleteMfaCode}
                    onChange={(event) =>
                      setDeleteMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                  />
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  type="submit"
                  variant="danger"
                  disabled={
                    deleting ||
                    deleteEmail.trim().toLowerCase() !== deleteCandidate.email?.trim().toLowerCase()
                  }
                >
                  {deleting ? 'Deleting…' : 'Permanently delete account'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={deleting}
                  onClick={() => setDeleteCandidate(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
