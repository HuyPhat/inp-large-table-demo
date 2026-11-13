import { useEffect } from 'react';
import type { Row } from './columns';
import { stats } from './stats';

const API = 'http://localhost:3002';

export type Patch = { status: string; qty: number; total: number; updatedAt: string };
export type Message = { seq: number; id: number; patch: Patch; sentAt: number };

export async function loadRows(): Promise<Row[]> {
  const res = await fetch(`${API}/rows`);
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  return (await res.json()).items;
}

/** Opens the SSE stream while `enabled`; calls onMessage once per message. */
export function useStream(
  rate: number,
  seed: number,
  enabled: boolean,
  onMessage: (message: Message) => void,
) {
  useEffect(() => {
    if (!enabled || rate <= 0) return;
    const source = new EventSource(`${API}/stream?rate=${rate}&seed=${seed}`);
    source.onmessage = (e) => {
      stats.received++;
      onMessage(JSON.parse(e.data));
    };
    return () => source.close();
    // onMessage is intentionally not a dependency: it must stay stable per variant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, seed, enabled]);
}
