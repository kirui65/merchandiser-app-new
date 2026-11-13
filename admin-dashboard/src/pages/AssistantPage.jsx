import React, { useEffect, useState } from 'react';
import client from '../api/client';
import Button from '../components/Button';
import { exportPdf } from '../utils/export';

const starters = [
  'Summarise sales performance for this period.',
  'What should I pay attention to in leads and conversions?',
  'Prepare a PDF-ready applicant report with names, contacts, county, and status.',
];

function renderInlineMarkdown(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function MarkdownMessage({ text }) {
  const lines = String(text || '').split(/\r?\n/);
  const blocks = [];
  let paragraph = [];
  let list = [];
  let table = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(<p key={`p-${blocks.length}`}>{renderInlineMarkdown(paragraph.join(' '))}</p>);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push(<ul key={`ul-${blocks.length}`}>{list.map((item, index) => <li key={index}>{renderInlineMarkdown(item)}</li>)}</ul>);
      list = [];
    }
  };
  const flushTable = () => {
    if (table.length < 2) {
      table.forEach((row) => paragraph.push(row.join(' · ')));
      table = [];
      return;
    }
    const [head, ...body] = table;
    blocks.push(
      <div className="assistant-table-wrap" key={`table-${blocks.length}`}>
        <table><thead><tr>{head.map((cell, index) => <th key={index}>{renderInlineMarkdown(cell)}</th>)}</tr></thead>
          <tbody>{body.map((row, rowIndex) => <tr key={rowIndex}>{head.map((_, cellIndex) => <td key={cellIndex}>{renderInlineMarkdown(row[cellIndex] || '')}</td>)}</tr>)}</tbody>
        </table>
      </div>,
    );
    table = [];
  };
  const parseTableRow = (line) => line.replace(/^\|\s?/, '').replace(/\s?\|$/, '').split('|').map((cell) => cell.trim());
  const isTableSeparator = (line) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      flushTable();
      return;
    }
    if (trimmed.includes('|') && trimmed.split('|').length >= 3) {
      flushParagraph();
      flushList();
      if (!isTableSeparator(trimmed)) table.push(parseTableRow(trimmed));
      return;
    }
    flushTable();
    const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(<h3 key={`h-${blocks.length}`}>{renderInlineMarkdown(heading[1])}</h3>);
    } else if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
    } else {
      flushList();
      paragraph.push(trimmed);
    }
  });
  flushParagraph();
  flushList();
  flushTable();
  return <div className="assistant-markdown">{blocks}</div>;
}

export default function AssistantPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/assistant/conversations')
      .then(({ data }) => setConversations(data.conversations || []))
      .catch(() => setError('Chat history could not be loaded.'))
      .finally(() => setHistoryLoading(false));
  }, []);

  async function ask(event) {
    event?.preventDefault();
    const message = input.trim();
    if (!message || loading) return;
    setError('');
    setMessages((current) => [...current, { role: 'user', text: message }]);
    setInput('');
    setLoading(true);
    try {
      const { data } = await client.post('/assistant/chat', { message });
      const assistantMessage = { role: 'assistant', text: data.answer };
      const nextMessages = [...messages, { role: 'user', text: message }, assistantMessage];
      setMessages((current) => [...current, assistantMessage]);
      const historyResponse = conversationId
        ? await client.patch(`/assistant/conversations/${conversationId}`, { messages: nextMessages })
        : await client.post('/assistant/conversations', { title: message.slice(0, 80), messages: nextMessages });
      const saved = historyResponse.data.conversation;
      setConversationId(saved.id);
      setConversations((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'The assistant could not answer right now.');
    } finally {
      setLoading(false);
    }
  }

  function resetChat() {
    setMessages([]);
    setConversationId(null);
    setError('');
    setInput('');
  }

  function exportResponse(message, index) {
    exportPdf('Brandsphere AI response', ['Response'], [[message.text]], {
      filename: `brandsphere-ai-response-${index + 1}.pdf`,
      subtitle: 'Confidential management assistant response',
    });
  }

  async function openConversation(id) {
    setError('');
    try {
      const { data } = await client.get(`/assistant/conversations/${id}`);
      setConversationId(data.conversation.id);
      setMessages(data.conversation.messages || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'Conversation could not be loaded.');
    }
  }

  return (
    <main className="page assistant-page">
      <section className="assistant-workspace">
        <header className="assistant-header">
          <div className="assistant-title-block">
            <div className="assistant-avatar assistant-avatar-large" aria-hidden="true">✦</div>
            <div>
              <span className="eyebrow">BRANDSPHERE INTELLIGENCE</span>
              <h1>How can I help?</h1>
              <p>Ask about sales, leads, field activity, and what deserves your attention.</p>
            </div>
          </div>
          <div className="assistant-header-actions">
            <span className="assistant-online"><i /> Online</span>
            {messages.length > 0 && <button type="button" className="assistant-clear" onClick={resetChat}>New chat</button>}
          </div>
        </header>

        {conversations.length > 0 && (
          <div className="assistant-history-strip">
            <span>Recent chats</span>
            {historyLoading ? <small>Loading…</small> : conversations.slice(0, 5).map((conversation) => (
              <button type="button" className={conversation.id === conversationId ? 'is-active' : ''} key={conversation.id} onClick={() => openConversation(conversation.id)}>
                {conversation.title || 'Untitled conversation'}
              </button>
            ))}
          </div>
        )}

        <div className="assistant-privacy"><span aria-hidden="true">▣</span> Read-only insights from your management data. The assistant cannot change records.</div>

        <div className={`assistant-conversation ${messages.length ? 'has-messages' : ''}`} aria-live="polite">
          {!messages.length && (
            <div className="assistant-welcome">
              <div className="assistant-welcome-icon" aria-hidden="true">✦</div>
              <h2>Your management co-pilot</h2>
              <p>Get a quick, practical read on your business. Try one of these questions or write your own below.</p>
              <div className="assistant-starters">
                {starters.map((starter) => <button type="button" key={starter} onClick={() => setInput(starter)}><span aria-hidden="true">↗</span>{starter}</button>)}
              </div>
            </div>
          )}
          {messages.map((message, index) => (
            <div className={`assistant-message assistant-message-${message.role}`} key={`${message.role}-${index}`}>
              {message.role === 'assistant' && <div className="assistant-avatar" aria-hidden="true">✦</div>}
              <div className="assistant-message-content">
                <strong>{message.role === 'user' ? 'You' : 'Brandsphere AI'}</strong>
                <MarkdownMessage text={message.text} />
                {message.role === 'assistant' && <button type="button" className="assistant-export" onClick={() => exportResponse(message, index)}>⇩ Export PDF</button>}
              </div>
            </div>
          ))}
          {loading && <div className="assistant-message assistant-message-assistant"><div className="assistant-avatar" aria-hidden="true">✦</div><div className="assistant-message-content"><strong>Brandsphere AI</strong><p className="assistant-thinking"><i /><i /><i /> Thinking</p></div></div>}
        </div>

        {error && <div className="error-banner">{error}</div>}
        <form className="assistant-composer" onSubmit={ask}>
          <textarea value={input} maxLength={2000} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); ask(event); } }} placeholder="Message your assistant…" rows={1} aria-label="Message your assistant" />
          <div className="assistant-composer-footer"><small>Enter to send · Shift + Enter for a new line</small><Button type="submit" disabled={loading || !input.trim()} aria-label="Send message">↑</Button></div>
        </form>
      </section>
    </main>
  );
}
