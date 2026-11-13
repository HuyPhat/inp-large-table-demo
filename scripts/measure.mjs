// Drives real clicks and keystrokes against the production build and prints
// Event Timing results. Requires `pnpm build && pnpm start` in another terminal.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function run(browser, path, throttle) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE + path);
  await page.waitForSelector('[data-ready]');
  await page.waitForTimeout(1000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });

  const select = page.locator('button.row-select');
  for (const index of [0, 2, 4, 6, 8]) {
    await select.nth(index).click();
    await page.waitForTimeout(1500);
  }
  await page.locator('#filter').click();
  await page.waitForTimeout(1500);
  await page.locator('#filter').pressSequentially('acme', { delay: 1500 });
  await page.waitForTimeout(3000);

  const { interactions, nodes } = await page.evaluate(() => ({
    interactions: [...window.__interactions.values()],
    nodes: document.querySelectorAll('*').length,
  }));
  await page.close();

  const clicks = interactions.filter((i) => /^(pointer|click)/.test(i.name));
  const keys = interactions.filter((i) => /^key/.test(i.name));
  const summary = (list) =>
    list.length
      ? {
          n: list.length,
          medianMs: median(list.map((i) => i.duration)),
          worstMs: Math.max(...list.map((i) => i.duration)),
          medianJsMs: Math.round(median(list.map((i) => i.js))),
          medianPaintMs: Math.round(median(list.map((i) => i.paint))),
        }
      : { n: 0 };
  return { path, throttle, nodesAfterFilter: nodes, click: summary(clicks), key: summary(keys) };
}

const browser = await chromium.launch();
for (const throttle of [1, 4]) {
  for (const path of ['/broken', '/fixed']) {
    console.log(JSON.stringify(await run(browser, path, throttle)));
  }
}
await browser.close();
