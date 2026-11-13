import { useEffect, useState } from 'react';
import { COLUMNS, formatPerCell, type Column, type Row } from './columns';
import { stats } from './stats';
import { loadRows, useStream } from './stream';
import { Toolbar } from './Toolbar';

type State = { items: Row[]; seq: number; sentAt: number };

function Cell({ row, column }: { row: Row; column: Column }) {
  const text = formatPerCell(row, column);
  if (column.kind === 'status') return <span className={`badge ${text}`}>{text}</span>;
  return <span>{text}</span>;
}

function TableRow({ row, selected, onSelect }: { row: Row; selected: boolean; onSelect: () => void }) {
  return (
    <tr className={selected ? 'selected' : ''}>
      {COLUMNS.map((column) => (
        <td key={column.key}>
          {column.kind === 'id' ? (
            <button className="row-select" aria-pressed={selected} onClick={onSelect}>
              #{row.id}
            </button>
          ) : (
            <Cell row={row} column={column} />
          )}
        </td>
      ))}
    </tr>
  );
}

/**
 * The deliberately naive baseline: one setState per SSE message, which copies
 * the whole array and re-renders every row. Same markup as apps/web /broken.
 */
export function NaivePage({ rate, seed }: { rate: number; seed: number }) {
  const [state, setState] = useState<State>({ items: [], seq: 0, sentAt: 0 });
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    void loadRows().then((items) => setState({ items, seq: 0, sentAt: 0 }));
  }, []);

  useStream(rate, seed, state.items.length > 0, (m) =>
    setState((prev) => ({
      items: prev.items.map((row) => (row.id === m.id ? { ...row, ...m.patch } : row)),
      seq: m.seq,
      sentAt: m.sentAt,
    })),
  );

  stats.renders++;
  useEffect(() => {
    stats.committedSeq = state.seq;
    const { sentAt } = state;
    if (sentAt) requestAnimationFrame(() => stats.latencies.push(Date.now() - sentAt));
  }, [state]);

  // Runs on every render: every message, keystroke and selection change.
  const needle = query.toLowerCase();
  const visible = state.items.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));

  return (
    <main>
      <h1>Naive: one render per message, every row in the DOM</h1>
      <Toolbar query={query} onQuery={setQuery} shown={visible.length} ready={state.items.length > 0} rate={rate} />
      <div className="scroller">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <TableRow
                key={row.id}
                row={row}
                selected={row.id === selectedId}
                onSelect={() => setSelectedId(row.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
