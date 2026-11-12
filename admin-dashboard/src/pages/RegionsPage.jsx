import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';

const emptyForm = { name: '', countryCode: 'KE', active: true };

export default function RegionsPage() {
  const [regions, setRegions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get('/teams/regions');
      setRegions(data.regions || []);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => setError('Failed to load regions'));
  }, [load]);

  async function create(event) {
    event.preventDefault();
    setError(null);
    try {
      await client.post('/teams/regions', {
        ...form,
        countryCode: form.countryCode.trim().toUpperCase(),
      });
      setForm(emptyForm);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to create region');
    }
  }

  async function save(event) {
    event.preventDefault();
    setError(null);
    try {
      await client.patch(`/teams/regions/${editing.id}`, {
        name: editing.name,
        countryCode: editing.countryCode.trim().toUpperCase(),
        active: editing.active,
      });
      setEditing(null);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to update region');
    }
  }

  async function toggle(region) {
    try {
      await client.patch(`/teams/regions/${region.id}`, { active: !region.active });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to update region status');
    }
  }

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">TEAM ADMINISTRATION</span>
        <h1>Regions</h1>
        <p className="muted">Organize teams by country and operating region.</p>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="grid-2">
        <Card title="Create region">
          <form className="form-grid" onSubmit={create}>
            <div className="field">
              <label>Name</label>
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="field">
              <label>Country code</label>
              <input
                required
                minLength={2}
                maxLength={2}
                value={form.countryCode}
                onChange={(event) => setForm({ ...form, countryCode: event.target.value })}
              />
            </div>
            <Button type="submit">Create region</Button>
          </form>
        </Card>
        <Card title={loading ? 'Loading regions…' : `${regions.length} regions`}>
          {loading ? (
            <div className="table-loading" role="status">
              Loading regions…
            </div>
          ) : regions.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Country</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {regions.map((region) => (
                    <tr key={region.id}>
                      <td>{region.name}</td>
                      <td>{region.countryCode}</td>
                      <td>{region.active ? 'Active' : 'Inactive'}</td>
                      <td>
                        <Button variant="secondary" onClick={() => setEditing({ ...region })}>
                          Edit
                        </Button>{' '}
                        <Button variant="secondary" onClick={() => toggle(region)}>
                          {region.active ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No regions yet" message="Create a region before adding teams." />
          )}
        </Card>
      </div>
      {editing ? (
        <Card title={`Edit ${editing.name}`}>
          <form className="form-grid" onSubmit={save}>
            <div className="field">
              <label>Name</label>
              <input
                required
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              />
            </div>
            <div className="field">
              <label>Country code</label>
              <input
                required
                minLength={2}
                maxLength={2}
                value={editing.countryCode}
                onChange={(event) => setEditing({ ...editing, countryCode: event.target.value })}
              />
            </div>
            <div className="field">
              <label>Status</label>
              <select
                value={String(editing.active)}
                onChange={(event) =>
                  setEditing({ ...editing, active: event.target.value === 'true' })
                }
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
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
    </>
  );
}
