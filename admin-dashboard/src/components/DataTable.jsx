import React, { useEffect, useMemo, useState } from 'react';
import EmptyState from './EmptyState';

const PAGE_SIZES = [25, 50, 100];

function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Shared list table: sortable columns, sticky header, paging and optional
 * row selection with bulk actions.
 *
 * columns: [{ key, header, render?(row), sortValue?(row), align?, className? }]
 *   A column is sortable when it has sortValue, or when it has no render
 *   function (the raw row[key] is used). Set sortable: false to opt out.
 * bulkActions(selectedRows, clearSelection) renders buttons shown while rows
 * are selected; it also turns on the selection checkboxes.
 */
export default function DataTable({
  columns,
  rows,
  rowKey = (row) => row.id,
  loading = false,
  initialSort,
  pageSize: initialPageSize = 25,
  onRowClick,
  rowLabel = 'records',
  bulkActions,
  isRowSelectable = () => true,
  empty,
  className = '',
}) {
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selected, setSelected] = useState(() => new Set());

  const sortValue = (column, row) =>
    column.sortValue ? column.sortValue(row) : column.render ? null : row[column.key];
  const canSort = (column) =>
    column.sortable !== false && (Boolean(column.sortValue) || !column.render);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((item) => item.key === sort.key);
    if (!column) return rows;
    const direction = sort.direction === 'desc' ? -1 : 1;
    return [...rows].sort(
      (left, right) => direction * compare(sortValue(column, left), sortValue(column, right)),
    );
    // columns are recreated on every render by callers; sort by key only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const pageRows = sortedRows.slice(start, start + pageSize);

  useEffect(() => {
    // Jump back to the first page when filters change the row set.
    setPage(0);
  }, [rows.length]);

  useEffect(() => {
    // Drop selections for rows that are no longer listed (e.g. after a filter).
    setSelected((current) => {
      const keys = new Set(rows.map(rowKey));
      const next = new Set([...current].filter((key) => keys.has(key)));
      return next.size === current.size ? current : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const selectable = Boolean(bulkActions);
  const selectablePageRows = pageRows.filter(isRowSelectable);
  const allOnPageSelected =
    selectablePageRows.length > 0 &&
    selectablePageRows.every((row) => selected.has(rowKey(row)));
  const selectedRows = rows.filter((row) => selected.has(rowKey(row)));
  const clearSelection = () => setSelected(new Set());

  function toggleSort(column) {
    if (!canSort(column)) return;
    setSort((current) =>
      current?.key === column.key
        ? { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key: column.key, direction: 'asc' },
    );
  }

  function toggleRow(row) {
    const key = rowKey(row);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function togglePage() {
    setSelected((current) => {
      const next = new Set(current);
      selectablePageRows.forEach((row) =>
        allOnPageSelected ? next.delete(rowKey(row)) : next.add(rowKey(row)),
      );
      return next;
    });
  }

  if (loading) {
    return (
      <div className="data-table-skeleton" role="status" aria-label={`Loading ${rowLabel}`}>
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return empty || <EmptyState title={`No ${rowLabel}`} />;
  }

  return (
    <div className={`data-table ${className}`}>
      {selectable && selectedRows.length ? (
        <div className="data-table-bulkbar" role="region" aria-label="Bulk actions">
          <strong>{selectedRows.length} selected</strong>
          <div className="data-table-bulk-actions">{bulkActions(selectedRows, clearSelection)}</div>
          <button type="button" className="data-table-link" onClick={clearSelection}>
            Clear selection
          </button>
        </div>
      ) : null}
      <div className="table-wrap data-table-scroll">
        <table>
          <thead>
            <tr>
              {selectable ? (
                <th className="data-table-check">
                  <input
                    type="checkbox"
                    aria-label="Select all rows on this page"
                    checked={allOnPageSelected}
                    disabled={!selectablePageRows.length}
                    onChange={togglePage}
                  />
                </th>
              ) : null}
              {columns.map((column) => {
                const sorted = sort?.key === column.key ? sort.direction : null;
                return (
                  <th
                    key={column.key}
                    className={column.align === 'right' ? 'is-numeric' : undefined}
                    aria-sort={
                      sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                  >
                    {canSort(column) ? (
                      <button
                        type="button"
                        className="data-table-sort"
                        onClick={() => toggleSort(column)}
                      >
                        {column.header}
                        <span aria-hidden="true" className={sorted ? 'is-active' : ''}>
                          {sorted === 'desc' ? '↓' : sorted === 'asc' ? '↑' : '↕'}
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const key = rowKey(row);
              const isSelected = selected.has(key);
              return (
                <tr
                  key={key}
                  className={`${onRowClick ? 'is-clickable' : ''} ${isSelected ? 'is-selected' : ''}`}
                  onClick={
                    onRowClick
                      ? (event) => {
                          // Buttons, links and inputs inside a row keep their own behaviour.
                          if (event.target.closest('button, a, input, select, textarea, label'))
                            return;
                          onRowClick(row);
                        }
                      : undefined
                  }
                >
                  {selectable ? (
                    <td className="data-table-check">
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        checked={isSelected}
                        disabled={!isRowSelectable(row)}
                        onChange={() => toggleRow(row)}
                      />
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={
                        [column.align === 'right' ? 'is-numeric' : '', column.className || '']
                          .join(' ')
                          .trim() || undefined
                      }
                    >
                      {column.render ? column.render(row) : (row[column.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="data-table-footer">
        <span className="muted">
          Showing {start + 1}–{Math.min(start + pageSize, sortedRows.length)} of{' '}
          {sortedRows.length.toLocaleString()} {rowLabel}
        </span>
        <div className="data-table-pager">
          <label>
            Rows
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ui-button ui-button-secondary"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            Previous
          </button>
          <span className="muted">
            Page {safePage + 1} of {pageCount}
          </span>
          <button
            type="button"
            className="ui-button ui-button-secondary"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
