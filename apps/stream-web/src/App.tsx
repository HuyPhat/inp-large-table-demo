import { InpMeter } from './InpMeter';

export function App() {
  return (
    <main>
      <h1>SSE stream demo</h1>
      <div className="toolbar">
        <span>0 rows</span>
        <InpMeter />
      </div>
    </main>
  );
}
