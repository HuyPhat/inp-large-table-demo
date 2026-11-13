'use client';

import { useEffect, useState } from 'react';

export type Row = Record<string, string | number> & { id: number; currency: string };
type Kind = 'id' | 'text' | 'status' | 'money' | 'percent' | 'date' | 'number';
export type Column = { key: string; label: string; kind: Kind };

export const COLUMNS: Column[] = [
  { key: 'id', label: 'ID', kind: 'id' },
  { key: 'sku', label: 'SKU', kind: 'text' },
  { key: 'product', label: 'Product', kind: 'text' },
  { key: 'customer', label: 'Customer', kind: 'text' },
  { key: 'email', label: 'Email', kind: 'text' },
  { key: 'region', label: 'Region', kind: 'text' },
  { key: 'status', label: 'Status', kind: 'status' },
  { key: 'owner', label: 'Owner', kind: 'text' },
  { key: 'channel', label: 'Channel', kind: 'text' },
  { key: 'warehouse', label: 'Warehouse', kind: 'text' },
  { key: 'qty', label: 'Qty', kind: 'number' },
  { key: 'unitPrice', label: 'Unit price', kind: 'money' },
  { key: 'discount', label: 'Discount', kind: 'percent' },
  { key: 'tax', label: 'Tax', kind: 'percent' },
  { key: 'total', label: 'Total', kind: 'money' },
  { key: 'margin', label: 'Margin', kind: 'percent' },
  { key: 'createdAt', label: 'Created', kind: 'date' },
  { key: 'updatedAt', label: 'Updated', kind: 'date' },
  { key: 'note', label: 'Note', kind: 'text' },
];

const LOCALE = 'en-US';
const makeMoney = (currency: string) =>
  new Intl.NumberFormat(LOCALE, { style: 'currency', currency });
const makePercent = () => new Intl.NumberFormat(LOCALE, { style: 'percent' });
const makeDate = () =>
  new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

/** The common mistake: a new Intl formatter for every cell on every render. */
export function formatPerCell(row: Row, column: Column): string {
  const value = row[column.key];
  if (column.kind === 'money') return makeMoney(row.currency).format(Number(value));
  if (column.kind === 'percent') return makePercent().format(Number(value));
  if (column.kind === 'date') return makeDate().format(new Date(value));
  return String(value);
}

const moneyByCurrency = new Map<string, Intl.NumberFormat>();
const percent = makePercent();
const date = makeDate();

/** Same output as formatPerCell, with each formatter built once. */
export function formatCached(row: Row, column: Column): string {
  const value = row[column.key];
  if (column.kind === 'money') {
    let money = moneyByCurrency.get(row.currency);
    if (!money) moneyByCurrency.set(row.currency, (money = makeMoney(row.currency)));
    return money.format(Number(value));
  }
  if (column.kind === 'percent') return percent.format(Number(value));
  if (column.kind === 'date') return date.format(new Date(value));
  return String(value);
}

export function useRows() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(1000);
  const [data, setData] = useState<{ items: Row[]; total: number }>({ items: [], total: 0 });
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`http://localhost:3001/rows?page=${page}&pageSize=${pageSize}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        return res.json();
      })
      .then((next) => {
        setData(next);
        setError('');
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [page, pageSize]);

  return { ...data, error, page, setPage, pageSize, setPageSize };
}

export function Toolbar({
  query,
  onQuery,
  table,
  shown,
}: {
  query: string;
  onQuery: (value: string) => void;
  table: ReturnType<typeof useRows>;
  shown: number;
}) {
  const lastPage = Math.max(Math.ceil(table.total / table.pageSize), 1);
  return (
    <div className="toolbar">
      <input
        id="filter"
        aria-label="Filter rows"
        placeholder="Filter rows…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      <label>
        Page size{' '}
        <select
          value={table.pageSize}
          onChange={(e) => {
            table.setPage(1);
            table.setPageSize(Number(e.target.value));
          }}
        >
          {[100, 500, 1000].map((size) => (
            <option key={size}>{size}</option>
          ))}
        </select>
      </label>
      <button disabled={table.page <= 1} onClick={() => table.setPage(table.page - 1)}>
        Prev
      </button>
      <span>
        Page {table.page} / {lastPage}
      </span>
      <button disabled={table.page >= lastPage} onClick={() => table.setPage(table.page + 1)}>
        Next
      </button>
      <span data-ready={table.total > 0 || undefined}>{shown} rows</span>
      {table.error && <span role="alert">Could not load rows: {table.error}</span>}
      <InpMeter />
    </div>
  );
}

type Interaction = {
  id: number;
  name: string;
  duration: number;
  delay: number;
  js: number;
  paint: number;
};

declare global {
  interface Window {
    __interactions?: Map<number, Interaction>;
  }
}

/**
 * Event Timing API, the data source behind INP. Each interaction splits into
 * input delay + event handlers/render (js) + presentation (style, layout, paint).
 */
function InpMeter() {
  const [last, setLast] = useState<Interaction>();
  const [worst, setWorst] = useState(0);

  useEffect(() => {
    const interactions = new Map<number, Interaction>();
    window.__interactions = interactions;
    const observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEventTiming & { interactionId: number })[]) {
        if (!e.interactionId) continue;
        const known = interactions.get(e.interactionId);
        const js = e.processingEnd - e.processingStart;
        // Events of one interaction often tie on duration (it is rounded to 8ms):
        // keep the one that did the work, which is usually click or keydown.
        if (known && (e.duration < known.duration || (e.duration === known.duration && js <= known.js))) continue;
        const item = {
          id: e.interactionId,
          name: e.name,
          duration: e.duration,
          delay: e.processingStart - e.startTime,
          js,
          paint: e.startTime + e.duration - e.processingEnd,
        };
        interactions.set(e.interactionId, item);
        setLast(item);
        setWorst((current) => Math.max(current, item.duration));
      }
    });
    observer.observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);
    return () => observer.disconnect();
  }, []);

  const rating = !last ? '' : worst <= 200 ? 'good' : worst <= 500 ? 'warn' : 'bad';
  const ms = (value: number) => `${Math.round(value)}ms`;
  return (
    <output className={`meter ${rating}`}>
      {last
        ? `Worst ${ms(worst)} · last ${last.name} ${ms(last.duration)} (delay ${ms(last.delay)}, js ${ms(last.js)}, paint ${ms(last.paint)})`
        : 'Click or type to measure INP'}
    </output>
  );
}
