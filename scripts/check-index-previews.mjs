// Run with playwright-core available through NODE_PATH and CHROME_PATH set.
// node scripts/check-index-previews.mjs http://localhost:3000
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright-core");

const url = process.argv[2] || "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
try {
  const staticPage = await browser.newPage({ javaScriptEnabled: false });
  const response = await staticPage.goto(url);
  const previews = staticPage.locator("main [inert]");
  const count = await previews.count();
  assert.ok(count > 6);
  assert.equal(await previews.evaluateAll((els) => els.filter((el) => el.childElementCount).length), 6);
  console.log(`Server HTML: ${(await response.body()).length} bytes; ${count} cards; 6 rendered previews.`);
  await staticPage.close();

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  const card = page.locator("main li").filter({ has: page.locator('a[href="/lab/odometer"]') });
  const stage = card.locator(":scope > [inert]");
  assert.equal(await stage.locator(":scope > *").count(), 0);
  const height = await stage.evaluate((el) => el.getBoundingClientRect().height);
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await card.scrollIntoViewIfNeeded();
  await stage.locator(":scope > *").waitFor();
  await page.waitForTimeout(600);
  assert.equal(await stage.evaluate((el) => el.getBoundingClientRect().height), height);
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight), pageHeight);
  await card.hover();
  await page.waitForTimeout(200);
  const scroll = await page.evaluate(() => scrollY);
  await card.locator('a[href="/lab/odometer"]').click();
  await page.waitForURL("**/lab/odometer");
  await page.goBack();
  await page.waitForTimeout(1200);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - scroll) < 2, "Back navigation must restore scroll");
  await page.getByRole("searchbox", { name: "Search the lab" }).fill("typewriter");
  const result = page.locator("main li").filter({ has: page.locator('a[href="/lab/typewriter"]') });
  await result.scrollIntoViewIfNeeded();
  await result.locator("[inert] > *").waitFor();
  assert.equal(await page.locator("main [inert]").count(), 1);
  assert.deepEqual(errors, []);
  console.log("Deferred previews mount on scroll and search, reserve their height, and preserve back navigation.");

  const touch = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  await touch.goto(url);
  await touch.getByRole("searchbox", { name: "Search the lab" }).fill("copy email");
  const email = touch.locator("main li").filter({ has: touch.locator('a[href="/lab/copy-email"]') });
  await email.scrollIntoViewIfNeeded();
  await email.locator("[inert] > *").waitFor();
  for (const ratio of [0.5, 0.7, 0.5]) {
    await email.evaluate((el, visible) => {
      const box = el.getBoundingClientRect();
      scrollTo(0, scrollY + box.top - (innerHeight - box.height * visible));
    }, ratio);
    // The letter-by-letter exit needs time to finish after playback stops.
    if (ratio < 0.6) await touch.waitForTimeout(1800);
    const mutations = await email.evaluate(async (el) => {
      let count = 0;
      const observer = new MutationObserver((records) => { count += records.length; });
      observer.observe(el.querySelector("[inert]"), { subtree: true, attributes: true, childList: true });
      await new Promise((resolve) => setTimeout(resolve, 3000));
      observer.disconnect();
      return count;
    });
    assert.equal(mutations > 0, ratio >= 0.6, `Touch playback at ${ratio * 100}% visibility`);
  }
  console.log("Touch previews play only while at least 60% visible.");
} finally {
  await browser.close();
}
