import React from 'react';
import Card from './Card';
import EmptyState from './EmptyState';
import { formatKes } from '../utils/formatters';
export default function RepTable({ byRep }) {
  const rows = Object.entries(byRep || {});
  return (
    <Card title="Totals by rep">
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rep ID</th>
                <th style={{ textAlign: 'right' }}>Total (KES)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([repId, total]) => (
                <tr key={repId}>
                  <td>{repId}</td>
                  <td style={{ textAlign: 'right' }}>{formatKes(total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No rep totals"
          message="Sales will appear here as the field team records them."
        />
      )}
    </Card>
  );
}
