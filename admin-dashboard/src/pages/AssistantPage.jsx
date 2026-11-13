import React, { useState } from 'react';
import client from '../api/client';
import Button from '../components/Button';
import { businessDateKey, businessDateStartIso, businessDateEndIso } from '../utils/businessDate';

const today = businessDateKey();
const monthStart = `${today.slice(0, 7)}-01`;

const starters = [
  'Summarise sales performance for this period.',
  'What should I pay attention to in leads and conversions?',
  'Compare the strongest and weakest team activity.',
];

export default function AssistantPage() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function ask(event) {
    event?.preventDefault();
    const message = input.trim();
    if (!message || loading) return;
    setError('');
    setMessages((current) => [...current, { role: 'user', text: message }]);
    setInput('');
    setLoading(true);
    try {
      const { data } = await client.post('/assistant/chat', {
        message,
        from: businessDateStartIso(from).slice(0, 10),
        to: businessDateEndIso(to).slice(0, 10),
      });
      setMessages((current) => [...current, { role: 'assistant', text: data.answer }]);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'The assistant could not answer right now.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page assistant-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">MANAGEMENT INTELLIGENCE</span>
          <h1>AI assistant</h1>
          <p className="muted">Ask questions about aggregate company performance for a selected period.</p>
        </div>
      </header>

      <section className="card assistant-card">
        <div className="assistant-notice">
          The assistant uses read-only management report data. It cannot change records or access passwords and secrets.
        </div>
        <div className="assistant-period">
          <label>From<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>To<input type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} /></label>
        </div>
        {!messages.length && (
          <div className="assistant-starters">
            {starters.map((starter) => <button type="button" key={starter} onClick={() => setInput(starter)}>{starter}</button>)}
          </div>
        )}
        <div className="assistant-messages" aria-live="polite">
          {messages.map((message, index) => (
            <div className={`assistant-message assistant-message-${message.role}`} key={`${message.role}-${index}`}>
              <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
              <p>{message.text}</p>
            </div>
          ))}
          {loading && <div className="assistant-message assistant-message-assistant"><strong>Assistant</strong><p>Reviewing the selected period…</p></div>}
        </div>
        {error && <div className="error-banner">{error}</div>}
        <form className="assistant-composer" onSubmit={ask}>
          <textarea value={input} maxLength={2000} onChange={(event) => setInput(event.target.value)} placeholder="Ask a management question…" rows={3} />
          <div className="assistant-composer-footer"><small>{input.length}/2000</small><Button type="submit" disabled={loading || !input.trim()}>{loading ? 'Thinking…' : 'Ask assistant'}</Button></div>
        </form>
      </section>
    </main>
  );
}
