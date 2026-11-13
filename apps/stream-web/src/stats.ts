// Counters the measurement script reads from window.__stats.
export type Stats = {
  received: number; // SSE messages parsed by the page (drops below the server rate when the main thread is starved)
  renders: number; // renders of the table component
  committedSeq: number; // highest message seq reflected in the committed state
  latencies: number[]; // ms from server send to the first frame after commit (approximate display latency)
};

declare global {
  interface Window {
    __stats?: Stats;
  }
}

export const stats: Stats = { received: 0, renders: 0, committedSeq: 0, latencies: [] };
window.__stats = stats;
