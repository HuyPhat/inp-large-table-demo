import { NaivePage } from './NaivePage';

// Variant and parameters come from the query string, e.g. /?mode=naive&rate=1000&seed=1
const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'naive';
const rate = Number(params.get('rate') ?? 1000);
const seed = Number(params.get('seed') ?? 1);

export function App() {
  if (mode === 'naive') return <NaivePage rate={rate} seed={seed} />;
  return <p>Unknown mode: {mode}</p>;
}
