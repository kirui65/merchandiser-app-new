import React, { useEffect, useState } from 'react';
import client from '../api/client';
import Button from '../components/Button';
import Card from '../components/Card';
import { apiErrorMessage, useToast } from '../components/Feedback';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseRecipients(text) {
  return text
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export default function SettingsPage() {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [recipientsText, setRecipientsText] = useState('');
  const [testRecipient, setTestRecipient] = useState('');
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    client
      .get('/settings')
      .then((response) => {
        setForm(response.data.settings);
        setRecipientsText(response.data.settings.reports.recipients.join(', '));
      })
      .catch((error) => setLoadError(apiErrorMessage(error, 'Could not load settings.')));
  }, []);

  const update = (changes) => setForm((current) => ({ ...current, ...changes }));
  const updateReports = (changes) =>
    setForm((current) => ({ ...current, reports: { ...current.reports, ...changes } }));

  function toggleDay(day) {
    const days = form.workWeekDays.includes(day)
      ? form.workWeekDays.filter((value) => value !== day)
      : [...form.workWeekDays, day];
    update({ workWeekDays: days });
  }

  async function save(event) {
    event.preventDefault();
    if (!form.workWeekDays.length) {
      toast.error('Choose at least one working day.');
      return;
    }
    setSaving(true);
    try {
      const response = await client.put('/settings', {
        companyName: form.companyName,
        workWeekDays: form.workWeekDays,
        defaultMonthlyTargetKsh: Number(form.defaultMonthlyTargetKsh) || 0,
        defaultCommissionKsh: Number(form.defaultCommissionKsh) || 0,
        reports: { ...form.reports, recipients: parseRecipients(recipientsText) },
      });
      setForm(response.data.settings);
      setRecipientsText(response.data.settings.reports.recipients.join(', '));
      toast.success('Settings saved.');
    } catch (error) {
      toast.error(
        apiErrorMessage(error, 'Could not save settings. Check the email addresses and amounts.'),
      );
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setSending(true);
    try {
      const response = await client.post(
        '/reports/scheduled/send-test',
        testRecipient.trim() ? { to: testRecipient.trim() } : {},
      );
      toast.success(`Report sent to ${response.data.to.join(', ')}.`);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not send the report.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">ADMINISTRATION</span>
        <h1>Settings</h1>
        <p className="muted">Company details, defaults for new records, and scheduled reports.</p>
      </div>
      {loadError ? (
        <div className="error-banner" role="alert">
          {loadError}
        </div>
      ) : null}
      {!form && !loadError ? (
        <div className="data-table-skeleton" role="status" aria-label="Loading settings">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {form ? (
        <form className="settings-form" onSubmit={save}>
          <Card title="Company">
            <div className="grid-2">
              <div className="field">
                <label htmlFor="settings-company">Company name</label>
                <input
                  id="settings-company"
                  value={form.companyName}
                  maxLength={100}
                  required
                  onChange={(event) => update({ companyName: event.target.value })}
                />
                <small className="muted">Used in report emails.</small>
              </div>
            </div>
            <fieldset className="settings-days">
              <legend>Working days</legend>
              {WEEKDAYS.map((name, day) => (
                <label key={name} className="settings-chip">
                  <input
                    type="checkbox"
                    checked={form.workWeekDays.includes(day)}
                    onChange={() => toggleDay(day)}
                  />
                  {name.slice(0, 3)}
                </label>
              ))}
            </fieldset>
          </Card>
          <Card title="Defaults for new records">
            <div className="grid-2">
              <div className="field">
                <label htmlFor="settings-target">Default monthly sales target (KSh)</label>
                <input
                  id="settings-target"
                  type="number"
                  min="0"
                  step="1"
                  value={form.defaultMonthlyTargetKsh}
                  onChange={(event) => update({ defaultMonthlyTargetKsh: event.target.value })}
                />
                <small className="muted">
                  Pre-filled when you set a representative’s target.
                </small>
              </div>
              <div className="field">
                <label htmlFor="settings-commission">Default commission per placement (KSh)</label>
                <input
                  id="settings-commission"
                  type="number"
                  min="0"
                  step="1"
                  value={form.defaultCommissionKsh}
                  onChange={(event) => update({ defaultCommissionKsh: event.target.value })}
                />
                <small className="muted">Pre-filled when you create a recruitment campaign.</small>
              </div>
            </div>
          </Card>
          <Card title="Scheduled report email">
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={form.reports.enabled}
                onChange={(event) => updateReports({ enabled: event.target.checked })}
              />
              <span>
                <strong>Email a sales summary automatically</strong>
                <small className="muted">
                  Summary, sales, leads, referral applicants and field activity reports, each as a
                  PDF attachment.
                </small>
              </span>
            </label>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="settings-frequency">How often</label>
                <select
                  id="settings-frequency"
                  value={form.reports.frequency}
                  onChange={(event) => updateReports({ frequency: event.target.value })}
                >
                  <option value="daily">Every day (covers yesterday)</option>
                  <option value="weekly">Every week (covers the last 7 days)</option>
                </select>
              </div>
              {form.reports.frequency === 'weekly' ? (
                <div className="field">
                  <label htmlFor="settings-weekday">Send on</label>
                  <select
                    id="settings-weekday"
                    value={form.reports.weekday}
                    onChange={(event) => updateReports({ weekday: Number(event.target.value) })}
                  >
                    {WEEKDAYS.map((name, day) => (
                      <option key={name} value={day}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="field settings-wide">
                <label htmlFor="settings-recipients">Recipients</label>
                <textarea
                  id="settings-recipients"
                  rows={2}
                  value={recipientsText}
                  placeholder="manager@company.com, director@company.com"
                  onChange={(event) => setRecipientsText(event.target.value)}
                />
                <small className="muted">
                  Separate addresses with commas. Up to 20. Reports go out around 7:00 am Nairobi
                  time.
                </small>
              </div>
            </div>
            <div className="settings-test">
              <div className="field">
                <label htmlFor="settings-test-to">Send a test report now</label>
                <input
                  id="settings-test-to"
                  type="email"
                  value={testRecipient}
                  placeholder="Leave blank to use the saved recipients"
                  onChange={(event) => setTestRecipient(event.target.value)}
                />
              </div>
              <Button variant="secondary" onClick={sendTest} disabled={sending}>
                {sending ? 'Sending…' : 'Send test'}
              </Button>
            </div>
          </Card>
          <div className="settings-actions">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
          </div>
        </form>
      ) : null}
    </>
  );
}
