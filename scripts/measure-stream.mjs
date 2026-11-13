// Measures stream-web while the SSE stream is running: real clicks and typing
// (same interaction script as measure.mjs) plus long tasks, frame gaps,
// display latency and main-thread busy time. Prints one JSON line per config.
//
// Needs `pnpm start` running in another terminal (stream-web :5173, stream-api :3002).
//   node scripts/measure-stream.mjs [--modes=naive] [--rates=0,1000] [--throttles=1,4]
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const list = (name, fallback) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback).split(',');
const modes = list('modes', 'naive');
const rates = list('rates', '0,1000').map(Number);
const throttles = list('throttles', '1').map(Number);

const sorted = (values) => [...values].sort((a, b) => a - b);
const percentile = (values, p) =>
  values.length ? Math.round(sorted(values)[Math.min(values.length - 1, Math.floor(values.length * p))]) : null;
const median = (values) => percentile(values, 0.5);

// Runs before the page's own scripts. The rAF loop keeps one callback per frame
// alive for the whole run, which costs almost nothing but is not zero.
const INIT = () => {
  const perf = (window.__perf = { long: [], gaps: [] });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) perf.long.push(e.duration);
  }).observe({ type: 'longtask', buffered: true });
  let last;
  const tick = (t) => {
    if (last !== undefined) perf.gaps.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

async function run(browser, { mode, rate, throttle }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(INIT);
  await page.goto(`${BASE}/?mode=${mode}&rate=${rate}&seed=1`);
  await page.waitForSelector('[data-ready]');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await cdp.send('Performance.enable');
  await page.waitForTimeout(2000);

  const taskSeconds = async () =>
    (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;
  const start = await page.evaluate(() => {
    window.__perf.long.length = 0;
    window.__perf.gaps.length = 0;
    const s = window.__stats;
    return { received: s.received, renders: s.renders, committed: s.committedSeq, latencies: s.latencies.length };
  });
  const t0 = Date.now();
  const busy0 = await taskSeconds();

  // Same interactions as measure.mjs, so rate=0 is comparable with its numbers.
  const select = page.locator('button.row-select');
  for (const index of [0, 2, 4, 6, 8]) {
    await select.nth(index).click({ timeout: 120_000 });
    await page.waitForTimeout(1500);
  }
  await page.locator('#filter').click({ timeout: 120_000 });
  await page.waitForTimeout(1500);
  await page.locator('#filter').pressSequentially('acme', { delay: 1500 });
  await page.waitForTimeout(3000);

  const seconds = (Date.now() - t0) / 1000;
  const busyPct = Math.round(((await taskSeconds()) - busy0) / seconds * 100);
  const end = await page.evaluate((from) => {
    const s = window.__stats;
    return {
      received: s.received,
      renders: s.renders,
      committed: s.committedSeq,
      latencies: s.latencies.slice(from),
      long: window.__perf.long.slice(),
      gaps: window.__perf.gaps.slice(),
      interactions: [...window.__interactions.values()],
      nodes: document.querySelectorAll('*').length,
    };
  }, start.latencies);
  await page.close();

  const summary = (list) =>
    list.length
      ? { n: list.length, medianMs: median(list.map((i) => i.duration)), worstMs: Math.max(...list.map((i) => i.duration)) }
      : { n: 0 };
  const third = Math.max(1, Math.floor(end.latencies.length / 3));
  return {
    mode,
    rate,
    throttle,
    seconds: Math.round(seconds),
    receivedPerSec: Math.round((end.received - start.received) / seconds),
    rendersPerSec: +((end.renders - start.renders) / seconds).toFixed(1),
    committedPerSec: Math.round((end.committed - start.committed) / seconds),
    backlogAtEnd: end.received - end.committed, // received but not yet on screen
    latencyMs: {
      p50: median(end.latencies),
      p95: percentile(end.latencies, 0.95),
      firstThirdP50: median(end.latencies.slice(0, third)), // compare with lastThird: growing or stable?
      lastThirdP50: median(end.latencies.slice(-third)),
    },
    longTasks: { n: end.long.length, totalMs: Math.round(end.long.reduce((a, b) => a + b, 0)) },
    fps: Math.round(end.gaps.length / seconds),
    framesOver50ms: end.gaps.filter((g) => g > 50).length,
    mainThreadBusyPct: busyPct,
    nodes: end.nodes,
    click: summary(end.interactions.filter((i) => /^(pointer|click)/.test(i.name))),
    key: summary(end.interactions.filter((i) => /^key/.test(i.name))),
  };
}

const browser = await chromium.launch();
for (const throttle of throttles) {
  for (const mode of modes) {
    for (const rate of rates) {
      console.log(JSON.stringify(await run(browser, { mode, rate, throttle })));
    }
  }
}
await browser.close();
