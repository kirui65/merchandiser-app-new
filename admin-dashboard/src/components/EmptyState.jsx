import React from 'react';
export default function EmptyState({ title, message }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">○</span>
      <strong>{title}</strong>
      {message ? <span>{message}</span> : null}
    </div>
  );
}
