import React from 'react';
export default function Card({ title, children, className = '' }) {
  return (
    <section className={`ui-card ${className}`}>
      {title ? (
        <div className="ui-card-heading">
          <h2>{title}</h2>
        </div>
      ) : null}
      {children}
    </section>
  );
}
