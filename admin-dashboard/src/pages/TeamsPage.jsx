import React, { useCallback, useEffect, useState } from 'react';
import client from '../api/client';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';

const emptyForm = { name: '', teamLeaderId: '', regionId: '' };

export default function TeamsPage() {
  const [teams, setTeams] = useState([]);
  const [regions, setRegions] = useState([]);
  const [reps, setReps] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedRepId, setSelectedRepId] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const [teamResponse, regionResponse, repResponse, membershipResponse] = await Promise.all([
      client.get('/teams'),
      client.get('/teams/regions'),
      client.get('/reps'),
      client.get('/teams/memberships'),
    ]);
    setTeams(teamResponse.data.teams || []);
    setRegions(regionResponse.data.regions || []);
    setReps(repResponse.data.reps || []);
    setMemberships(membershipResponse.data.memberships || []);
    const activeTeams = teamResponse.data.teams.filter((team) => team.active);
    setSelectedTeamId((current) =>
      activeTeams.some((team) => team.id === current) ? current : activeTeams[0]?.id || '',
    );
  }, []);

  useEffect(() => {
    load().catch(() => setError('Failed to load teams'));
  }, [load]);

  const regionById = new Map(regions.map((region) => [region.id, region]));
  const repById = new Map(reps.map((rep) => [rep.id, rep]));
  const leaders = reps.filter((rep) => rep.role === 'team_leader' && rep.active !== false);
  const activeMemberIds = new Set(
    memberships
      .filter(
        (membership) => membership.status === 'active' && membership.teamId !== selectedTeamId,
      )
      .map((membership) => membership.repId),
  );
  const members = reps.filter(
    (rep) =>
      ['rep', 'brand_ambassador', 'telemarketer', 'recruiter'].includes(rep.role) &&
      rep.active !== false &&
      !activeMemberIds.has(rep.id),
  );

  async function create(event) {
    event.preventDefault();
    setError(null);
    try {
      await client.post('/teams', form);
      setForm(emptyForm);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to create team');
    }
  }

  async function save(event) {
    event.preventDefault();
    setError(null);
    try {
      await client.patch(`/teams/${editing.id}`, {
        name: editing.name,
        teamLeaderId: editing.teamLeaderId,
        regionId: editing.regionId,
        active: editing.active,
      });
      setEditing(null);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to update team');
    }
  }

  async function addMember(event) {
    event.preventDefault();
    setError(null);
    try {
      await client.post('/teams/memberships', { teamId: selectedTeamId, repId: selectedRepId });
      setSelectedRepId('');
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to assign team member');
    }
  }

  async function endMembership(membership) {
    setError(null);
    try {
      await client.patch(`/teams/memberships/${membership.id}`, { status: 'ended' });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to end membership');
    }
  }

  async function toggleTeam(team) {
    setError(null);
    try {
      await client.patch(`/teams/${team.id}`, { active: !team.active });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Failed to update team status');
    }
  }

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">TEAM ADMINISTRATION</span>
        <h1>Teams</h1>
        <p className="muted">
          Assign team leaders, place field users in one active team, and organize coverage by
          region.
        </p>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="grid-2">
        <Card title="Create team">
          <form className="form-grid" onSubmit={create}>
            <div className="field">
              <label>Team name</label>
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="field">
              <label>Team leader</label>
              <select
                required
                value={form.teamLeaderId}
                onChange={(event) => setForm({ ...form, teamLeaderId: event.target.value })}
              >
                <option value="">Select a team leader</option>
                {leaders.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Region</label>
              <select
                required
                value={form.regionId}
                onChange={(event) => setForm({ ...form, regionId: event.target.value })}
              >
                <option value="">Select a region</option>
                {regions
                  .filter((region) => region.active)
                  .map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name} ({region.countryCode})
                    </option>
                  ))}
              </select>
            </div>
            <Button
              type="submit"
              disabled={!leaders.length || !regions.some((region) => region.active)}
            >
              Create team
            </Button>
            {!leaders.length || !regions.some((region) => region.active) ? (
              <p className="muted form-help">
                Create an active team leader account and an active region before creating a team.
              </p>
            ) : null}
          </form>
        </Card>
        <Card title="Add a team member">
          <form className="form-grid" onSubmit={addMember}>
            <div className="field">
              <label>Team</label>
              <select
                required
                value={selectedTeamId}
                onChange={(event) => setSelectedTeamId(event.target.value)}
              >
                <option value="">Select a team</option>
                {teams
                  .filter((team) => team.active)
                  .map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label>Field user or campaign recruiter</label>
              <select
                required
                value={selectedRepId}
                onChange={(event) => setSelectedRepId(event.target.value)}
              >
                <option value="">Select a team member</option>
                {members.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name} · {rep.role.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={!selectedTeamId || !selectedRepId}>
              Assign member
            </Button>
            {!teams.some((team) => team.active) || !members.length ? (
              <p className="muted form-help">
                Add an active team and an available field user or recruiter to enable assignment.
              </p>
            ) : null}
          </form>
          <p className="muted" style={{ marginBottom: 0 }}>
            Each field user can have one active team membership at a time. End the current
            membership before reassigning.
          </p>
        </Card>
      </div>

      {teams.length ? (
        teams.map((team) => {
          const teamMembers = memberships.filter(
            (membership) => membership.teamId === team.id && membership.status === 'active',
          );
          return (
            <Card key={team.id} title={team.name}>
              <div className="team-meta">
                <span>Region: {regionById.get(team.regionId)?.name || 'Unknown'}</span>
                <span>Leader: {repById.get(team.teamLeaderId)?.name || team.teamLeaderId}</span>
                <span>Status: {team.active ? 'Active' : 'Inactive'}</span>
                <Button variant="secondary" onClick={() => setEditing({ ...team })}>
                  Edit team
                </Button>
                <Button variant="secondary" onClick={() => toggleTeam(team)}>
                  {team.active ? 'Deactivate' : 'Reactivate'}
                </Button>
              </div>
              <div className="table-wrap" style={{ marginTop: 12 }}>
                {teamMembers.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Role</th>
                        <th>Membership started</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {teamMembers.map((membership) => (
                        <tr key={membership.id}>
                          <td>{repById.get(membership.repId)?.name || membership.repId}</td>
                          <td>{repById.get(membership.repId)?.role?.replace(/_/g, ' ') || '—'}</td>
                          <td>
                            {membership.startedAt?._seconds
                              ? new Date(membership.startedAt._seconds * 1000).toLocaleDateString()
                              : '—'}
                          </td>
                          <td>
                            <Button variant="danger" onClick={() => endMembership(membership)}>
                              End membership
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyState
                    title="No active members"
                    message="Assign field users above to add them to this team."
                  />
                )}
              </div>
            </Card>
          );
        })
      ) : (
        <Card>
          <EmptyState
            title="No teams yet"
            message="Create a region and provision a team leader account before adding a team."
          />
        </Card>
      )}

      {editing ? (
        <Card title={`Edit ${editing.name}`}>
          <form className="form-grid" onSubmit={save}>
            <div className="field">
              <label>Team name</label>
              <input
                required
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              />
            </div>
            <div className="field">
              <label>Team leader</label>
              <select
                required
                value={editing.teamLeaderId}
                onChange={(event) => setEditing({ ...editing, teamLeaderId: event.target.value })}
              >
                {leaders.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Region</label>
              <select
                required
                value={editing.regionId}
                onChange={(event) => setEditing({ ...editing, regionId: event.target.value })}
              >
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
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
