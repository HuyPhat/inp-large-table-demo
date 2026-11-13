'use client';

import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { COLUMNS, formatCached, Toolbar, useRows, type Row } from '../shared';

const ROW_HEIGHT = 36;

const VirtualRow = memo(function VirtualRow({
  row,
  index,
  top,
  selected,
  onSelect,
}: {
  row: Row;
  index: number;
  top: number;
  selected: boolean;
  onSelect: (id: number) => void;
}) {
  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      className={`grid-row body ${selected ? 'selected' : ''}`}
      style={{ transform: `translateY(${top}px)` }}
    >
      {COLUMNS.map((column) => {
        const text = formatCached(row, column);
        return (
          <div role="cell" key={column.key}>
            {column.kind === 'id' ? (
              <button
                className="row-select"
                aria-pressed={selected}
                onClick={() => onSelect(row.id)}
              >
                #{text}
              </button>
            ) : column.kind === 'status' ? (
              <span className={`badge ${text}`}>{text}</span>
            ) : (
              text
            )}
          </div>
        );
      })}
    </div>
  );
});

export default function FixedPage() {
  const table = useRows();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Only rebuilt when a new page of data arrives, not on every keystroke.
  const searchable = useMemo(
    () => table.items.map((row) => ({ row, text: JSON.stringify(row).toLowerCase() })),
    [table.items],
  );
  const visible = useMemo(() => {
    const needle = query.toLowerCase();
    return searchable.filter((item) => item.text.includes(needle)).map((item) => item.row);
  }, [searchable, query]);

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => visible[index].id,
    scrollMargin: ROW_HEIGHT, // the sticky header sits above the rows
    overscan: 5,
  });

  const onSelect = useCallback((id: number) => setSelectedId(id), []);

  return (
    <main>
      <h1>Fixed: only visible rows are in the DOM and only changed rows re-render</h1>
      <Toolbar query={query} onQuery={setQuery} table={table} shown={visible.length} />
      <div
        className="scroller"
        ref={scrollerRef}
        role="table"
        aria-label="Orders"
        aria-rowcount={visible.length + 1}
      >
        <div role="row" aria-rowindex={1} className="grid-row head">
          {COLUMNS.map((column) => (
            <div role="columnheader" key={column.key}>
              {column.label}
            </div>
          ))}
        </div>
        <div
          style={{
            position: 'relative',
            height: virtualizer.getTotalSize(),
            width: 'max-content',
          }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = visible[item.index];
            return (
              <VirtualRow
                key={item.key}
                row={row}
                index={item.index}
                top={item.start - ROW_HEIGHT}
                selected={row.id === selectedId}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      </div>
    </main>
  );
}
