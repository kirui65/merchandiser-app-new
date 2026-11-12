import React, { useEffect, useState } from 'react';
import client from '../api/client';
import Card from '../components/Card';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';

const initial = { name: '', address: '', lat: '', lng: '', assignedRepId: '', territoryId: '' };
const payload = (f) => ({
  name: f.name,
  address: f.address,
  location: { lat: Number(f.lat), lng: Number(f.lng) },
  ...(f.assignedRepId && { assignedRepId: f.assignedRepId }),
  ...(f.territoryId && { territoryId: f.territoryId }),
});

export default function OutletsPage() {
  const [outlets, setOutlets] = useState([]);
  const [reps, setReps] = useState([]);
  const [territories, setTerritories] = useState([]);
  const [overdue, setOverdue] = useState({ days: 7, overdueOutlets: [] });
  const [days, setDays] = useState('');
  const [daysDraft, setDaysDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(initial);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState([]);
  const [territoryId, setTerritoryId] = useState('');
  const [error, setError] = useState(null);
  const load = async () => {
    setLoading(true);
    try {
      const [o, r, t, d] = await Promise.all([
        client.get('/outlets'),
        client.get('/reps'),
        client.get('/territories'),
        client.get('/dashboard/overdue-outlets', { params: days ? { days: Number(days) } : {} }),
      ]);
      setOutlets(o.data.outlets);
      setReps(r.data.reps);
      setTerritories(t.data.territories);
      setOverdue(d.data);
      setError(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load().catch(() => setError('Failed to load outlets'));
  }, [days]);
  const fields = (value, setValue) => (
    <>
      <div className="field">
        <label>Name</label>
        <input
          required
          value={value.name}
          onChange={(e) => setValue({ ...value, name: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Address</label>
        <input
          required
          value={value.address}
          onChange={(e) => setValue({ ...value, address: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Latitude</label>
        <input
          required
          type="number"
          step="any"
          value={value.lat}
          onChange={(e) => setValue({ ...value, lat: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Longitude</label>
        <input
          required
          type="number"
          step="any"
          value={value.lng}
          onChange={(e) => setValue({ ...value, lng: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Assigned rep</label>
        <select
          value={value.assignedRepId}
          onChange={(e) => setValue({ ...value, assignedRepId: e.target.value })}
        >
          <option value="">Unassigned</option>
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Territory</label>
        <select
          value={value.territoryId}
          onChange={(e) => setValue({ ...value, territoryId: e.target.value })}
        >
          <option value="">Unassigned</option>
          {territories.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
  async function create(e) {
    e.preventDefault();
    try {
      await client.post('/outlets', { ...payload(form), active: true });
      setForm(initial);
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to create outlet');
    }
  }
  async function save(e) {
    e.preventDefault();
    try {
      await client.patch(`/outlets/${editing.id}`, payload(editing));
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update outlet');
    }
  }
  async function bulkAssign() {
    try {
      await client.patch('/outlets/bulk/territory', { outletIds: selected, territoryId });
      setSelected([]);
      setTerritoryId('');
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to assign territory');
    }
  }
  async function toggle(o) {
    try {
      await client.patch(`/outlets/${o.id}/status`, { active: o.active === false });
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to update outlet status');
    }
  }
  const all = outlets.length > 0 && selected.length === outlets.length;
  const overdueIds = new Set(overdue.overdueOutlets.map((o) => o.id));
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">FIELD NETWORK</span>
        <h1>Outlets</h1>
        <p className="muted">Manage locations and assign them to reps and territories.</p>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <Card className="outlet-overdue-controls">
        <div className="field">
          <label htmlFor="outlet-overdue-days">Overdue after days without a geofenced visit</label>
          <div className="inline-control-row">
            <input
              id="outlet-overdue-days"
              type="number"
              min="1"
              max="365"
              placeholder={`Default: ${overdue.days}`}
              value={daysDraft}
              onChange={(e) => setDaysDraft(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              onClick={() => setDays(daysDraft)}
            >
              Apply
            </Button>
          </div>
        </div>
        <p className="muted">
          {overdue.overdueOutlets.length} active outlets have not been visited in the last{' '}
          {overdue.days} days.
        </p>
      </Card>
      <div className="grid-2">
        <Card title="Create outlet">
          <form className="form-grid" onSubmit={create}>
            {fields(form, setForm)}
            <Button type="submit">Create outlet</Button>
          </form>
        </Card>
        <Card title={`${outlets.length} locations`}>
          {loading ? (
            <p className="muted">Loading outlets…</p>
          ) : outlets.length ? (
            <>
              <div className="outlet-bulk-toolbar">
                <strong>{selected.length} selected</strong>
                <select value={territoryId} onChange={(e) => setTerritoryId(e.target.value)}>
                  <option value="">Assign territory…</option>
                  {territories.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  disabled={!selected.length || !territoryId}
                  onClick={bulkAssign}
                >
                  Assign selected
                </Button>
                {!selected.length || !territoryId ? (
                  <small className="muted form-help">
                    Select outlets and a territory to enable assignment.
                  </small>
                ) : null}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <input
                          aria-label="Select all outlets"
                          type="checkbox"
                          checked={all}
                          onChange={(e) =>
                            setSelected(e.target.checked ? outlets.map((o) => o.id) : [])
                          }
                        />
                      </th>
                      <th>Name</th>
                      <th>Territory</th>
                      <th>Assigned rep</th>
                      <th>Visit alert</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outlets.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <input
                            aria-label={`Select ${o.name}`}
                            type="checkbox"
                            checked={selected.includes(o.id)}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, o.id]
                                  : selected.filter((id) => id !== o.id),
                              )
                            }
                          />
                        </td>
                        <td>{o.name}</td>
                        <td>
                          {territories.find((t) => t.id === o.territoryId)?.name || 'Unassigned'}
                        </td>
                        <td>{reps.find((r) => r.id === o.assignedRepId)?.name || 'Unassigned'}</td>
                        <td>
                          {o.active === false
                            ? '—'
                            : overdueIds.has(o.id)
                              ? `Overdue (${overdue.days}d+)`
                              : 'Current'}
                        </td>
                        <td>{o.active === false ? 'Inactive' : 'Active'}</td>
                        <td>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              setEditing({
                                ...o,
                                address: o.address || '',
                                lat: String(o.location?.lat ?? ''),
                                lng: String(o.location?.lng ?? ''),
                                assignedRepId: o.assignedRepId || '',
                                territoryId: o.territoryId || '',
                              })
                            }
                          >
                            Edit
                          </Button>{' '}
                          <Button variant="secondary" onClick={() => toggle(o)}>
                            {o.active === false ? 'Reactivate' : 'Deactivate'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <EmptyState
              title="No outlets yet"
              message="Create the first location to build your field plan."
            />
          )}
        </Card>
      </div>
      {editing && (
        <Card title={`Edit ${editing.name}`}>
          <form className="form-grid" onSubmit={save}>
            {fields(editing, setEditing)}
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
