import React from 'react';
import { Link } from 'react-router-dom';

// action: { label, onClick } or { label, to } for the obvious next step.
export default function EmptyState({ title, message, action }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">○</span>
      <strong>{title}</strong>
      {message ? <span>{message}</span> : null}
      {action?.to ? (
        <Link className="ui-button ui-button-primary empty-state-action" to={action.to}>
          {action.label}
        </Link>
      ) : action?.onClick ? (
        <button
          type="button"
          className="ui-button ui-button-primary empty-state-action"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
