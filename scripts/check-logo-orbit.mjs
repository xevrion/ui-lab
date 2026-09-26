// Run against a local server: node scripts/check-logo-orbit.mjs <url> [playwright-core module path]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.argv[3] || 'playwright-core');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [320, 375, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.clock.install();
      await page.goto(`${process.argv[2] || 'http://localhost:3000'}/lab/logo-orbit`);
      await page.waitForFunction(() => document.querySelector('main button[aria-label="React"]')?.parentElement.style.transform);
      await page.clock.runFor(100);
      // 64 seconds covers the slower ring's complete lap.
      for (let elapsed = 0; elapsed < 64000; elapsed += 500) {
        await page.clock.runFor(500);
        const overlaps = await page.locator('main h2').evaluate((heading) => {
          const range = document.createRange();
          range.selectNodeContents(heading);
          const lines = [...range.getClientRects()];
          const stage = heading.parentElement.parentElement.parentElement;
          return [...stage.querySelectorAll('button')].filter((button) => {
            const icon = button.querySelector('svg').getBoundingClientRect();
            return lines.some((line) => icon.left < line.right && icon.right > line.left && icon.top < line.bottom && icon.bottom > line.top);
          }).map((button) => ({name:button.getAttribute('aria-label'), icon:button.querySelector('svg').getBoundingClientRect().toJSON(), heading:lines.map(r=>r.toJSON())}));
        });
        assert.deepEqual(overlaps, [], `${width}px at ${elapsed}ms`);
      }
      await page.close();
    }
    console.log('Logo orbit clears its heading through a full lap at 320px, 375px and 1440px.');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
