import { useEffect, useState } from 'react';

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
 * Copy of the INP meter in apps/web (the two apps share no code on purpose).
 * Event Timing API: each interaction splits into input delay + event
 * handlers/render (js) + presentation (style, layout, paint).
 * Keeps the window.__interactions contract that the measurement scripts read.
 */
export function InpMeter() {
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
