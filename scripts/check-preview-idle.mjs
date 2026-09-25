// Run with playwright-core available through NODE_PATH and CHROME_PATH set.
// node scripts/check-preview-idle.mjs http://localhost:3000
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright-core");

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  try {
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion });
      await page.goto(process.argv[2] || "http://localhost:3000");
      for (const slug of ["relative-time", "page-dots", "typewriter", "story-progress", "dynamic-island"]) {
        await page.getByRole("searchbox", { name: "Search the lab" }).fill(slug.replaceAll("-", " "));
        const card = page.locator("main li").filter({ has: page.locator(`a[href="/lab/${slug}"]`) });
        await card.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await page.waitForTimeout(1000);
        const count = () => card.evaluate(async (el) => {
          let mutations = 0;
          const observer = new MutationObserver((records) => { mutations += records.length; });
          observer.observe(el.querySelector("[inert]"), { subtree: true, childList: true, characterData: true, attributes: true });
          await new Promise((resolve) => setTimeout(resolve, 4500));
          observer.disconnect();
          return mutations;
        });
        assert.equal(await count(), 0, `${slug} must stay idle with ${reducedMotion}`);
        await card.hover();
        // Reduced-motion page dots intentionally default to paused.
        if (slug !== "page-dots" || reducedMotion !== "reduce") {
          assert.ok(await count() > 0, `${slug} must play on hover with ${reducedMotion}`);
        }
        await page.mouse.move(0, 0);
        await page.waitForTimeout(1000);
        assert.equal(await count(), 0, `${slug} must stop after hover with ${reducedMotion}`);
      }
      await page.close();
    }
    console.log("All five previews stay idle and stop after hover, including reduced motion.");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
