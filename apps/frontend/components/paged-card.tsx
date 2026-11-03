"use client";

/**
 * A table that lives in a card of fixed size and turns pages inside it,
 * rather than running down the page one row per entry. The card is the same
 * height on every page, the last one included, so turning a page never moves
 * anything around it.
 */

import { ReactNode, useEffect, useState } from "react";

export interface PagedColumn {
  label: string;
  align?: "left" | "right";
}

export function PagedCard({
  title,
  subtitle,
  columns,
  rows,
  pageSize = 6,
  empty,
  ariaLabel,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  columns: PagedColumn[];
  /** One entry per row: a key and its cells, in column order. */
  rows: Array<{ key: string; cells: ReactNode[] }>;
  pageSize?: number;
  empty?: ReactNode;
  ariaLabel?: string;
}) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const [page, setPage] = useState(0);
  // A refresh that shortens the list must not strand the reader past the end.
  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [page, pages]);

  const start = page * pageSize;
  const shown = rows.slice(start, start + pageSize);
  const filler = rows.length > pageSize ? pageSize - shown.length : 0;

  return (
    <section className="panel paged-card">
      <div className="paged-card-head">
        <h2>{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="table-scroll paged-card-body">
        <table className="data-table" aria-label={ariaLabel}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.label} style={c.align === "right" ? { textAlign: "right" } : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key}>
                {r.cells.map((cell, i) => (
                  <td key={i} style={columns[i]?.align === "right" ? { textAlign: "right" } : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="muted">
                  {empty ?? "Nothing here yet."}
                </td>
              </tr>
            )}
            {/* Blank rows keep the last page as tall as the others. */}
            {Array.from({ length: filler }, (_, i) => (
              <tr key={`filler-${i}`} aria-hidden="true" className="paged-card-filler">
                <td colSpan={columns.length}>&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="paged-card-foot">
          <span className="muted">
            {start + 1}–{Math.min(rows.length, start + pageSize)} of {rows.length}
          </span>
          <div className="paged-card-nav">
            <button
              type="button"
              className="button-secondary"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Previous page"
            >
              ‹ Prev
            </button>
            <span className="muted" aria-live="polite">
              {page + 1} / {pages}
            </span>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              disabled={page >= pages - 1}
              aria-label="Next page"
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
