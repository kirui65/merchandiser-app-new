import React, { useEffect, useState } from 'react';
import client from '../api/client';
import Card from '../components/Card';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
const emptyForm = { name: '', description: '' };
export default function TerritoriesPage() {
  const [territories, setTerritories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  async function load() {
    const { data } = await client.get('/territories');
    setTerritories(data.territories);
  }
  useEffect(() => {
    load().catch(() => setError('Failed to load territories'));
  }, []);
  async function submit(event) {
    event.preventDefault();
    setError(null);
    try {
      await client.post('/territories', {
        name: form.name,
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
      });
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to create territory');
    }
  }
  async function save(event) {
    event.preventDefault();
    setError(null);
    try {
      await client.patch(`/territories/${editing.id}`, {
        name: editing.name,
        ...(editing.description?.trim() ? { description: editing.description.trim() } : {}),
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update territory');
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">FIELD NETWORK</span>
        <h1>Territories</h1>
        <p className="muted">
          Organize outlet coverage into practical regions. Assign outlets in bulk from the Outlets
          page.
        </p>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="grid-2">
        <Card title="Create territory">
          <form className="form-grid" onSubmit={submit}>
            <div className="field">
              <label>Name</label>
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="field">
              <label>
                Description <span className="muted">(optional)</span>
              </label>
              <input
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </div>
            <Button type="submit">Create territory</Button>
          </form>
        </Card>
        <Card title={`${territories.length} territories`}>
          {territories.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {territories.map((territory) => (
                    <tr key={territory.id}>
                      <td>{territory.name}</td>
                      <td>{territory.description || '—'}</td>
                      <td>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setEditing({ ...territory, description: territory.description || '' })
                          }
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No territories yet"
              message="Create a territory, then select outlets to assign from the Outlets page."
            />
          )}
        </Card>
      </div>
      {editing && (
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
              <label>
                Description <span className="muted">(optional)</span>
              </label>
              <input
                value={editing.description}
                onChange={(event) => setEditing({ ...editing, description: event.target.value })}
              />
            </div>
            <div>
              <Button type="submit">Save changes</Button>{' '}
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
