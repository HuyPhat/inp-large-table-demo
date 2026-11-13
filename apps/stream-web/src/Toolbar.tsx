import { InpMeter } from './InpMeter';

export function Toolbar({
  query,
  onQuery,
  shown,
  ready,
  rate,
}: {
  query: string;
  onQuery: (value: string) => void;
  shown: number;
  ready: boolean;
  rate: number;
}) {
  return (
    <div className="toolbar">
      <input
        id="filter"
        aria-label="Filter rows"
        placeholder="Filter rows…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      <span data-ready={ready || undefined}>{shown} rows</span>
      <span>stream: {rate} msg/s</span>
      <InpMeter />
    </div>
  );
}
