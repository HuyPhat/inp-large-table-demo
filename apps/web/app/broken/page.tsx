'use client';

import { useState } from 'react';
import { COLUMNS, formatPerCell, Toolbar, useRows, type Column, type Row } from '../shared';

function Cell({ row, column }: { row: Row; column: Column }) {
  const text = formatPerCell(row, column);
  if (column.kind === 'status') return <span className={`badge ${text}`}>{text}</span>;
  return <span>{text}</span>;
}

function TableRow({
  row,
  selected,
  onSelect,
}: {
  row: Row;
  selected: boolean;
  onSelect: () => void;
}) {
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

export default function BrokenPage() {
  const table = useRows();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Runs on every keystroke and on every selection change.
  const needle = query.toLowerCase();
  const visible = table.items.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));

  return (
    <main>
      <h1>Broken: every row is in the DOM and re-renders on any state change</h1>
      <Toolbar query={query} onQuery={setQuery} table={table} shown={visible.length} />
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
