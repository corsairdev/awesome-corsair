// Makes the picture each entry shows on corsair.dev/built-with, saved as data/shots/<id>.jpg or .png:
//   - a live app (kind hosted, url not on GitHub): a 1280x800 screenshot of its url, as JPEG
//   - anything else: GitHub's preview card for the repo (opengraph.githubassets.com), as PNG
// Only entries without a picture get one, so a run never rewrites the others. Pass ids to redo just those
// (`node tools/shots/capture.mjs neurosync noctra`), or --all to redo every entry. A page that animates in
// or loads its data late can be given longer before the picture: --wait=8000 (milliseconds, default 2500).
// A page that fails to load gets no picture; the site shows the card without one.
//
// Needs Playwright: `npm i --no-save playwright@1 && npx playwright install chromium`.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseList } from "../../scripts/build.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SHOTS = join(ROOT, "data/shots");
const VIEWPORT = { width: 1280, height: 800 };
const WAIT = process.argv.find((a) => a.startsWith("--wait="));
const SETTLE_MS = WAIT ? Number(WAIT.slice(7)) || 2500 : 2500;

const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const isLive = (p) => asArray(p.kind).includes("hosted") && !/github\.com/.test(p.url);
const shotPaths = (id) => [join(SHOTS, `${id}.jpg`), join(SHOTS, `${id}.png`)];
const hasShot = (id) => shotPaths(id).some((f) => existsSync(f));
const clear = (id) => shotPaths(id).forEach((f) => rmSync(f, { force: true }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function repoCard(p) {
  let res;
  // GitHub's card service answers 429 when asked for many cards at once: wait and ask again.
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch(`https://opengraph.githubassets.com/1/${p.repo}`, { redirect: "follow" });
    if (res.status !== 429) break;
    await sleep(Number(res.headers.get("retry-after")) * 1000 || 15_000 * (attempt + 1));
  }
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.startsWith("image/png")) throw new Error(`card ${res.status} ${type}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5_000) throw new Error(`card too small (${buf.length} bytes)`);
  return buf;
}

async function screenshot(browser, p) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: "light" });
  const page = await context.newPage();
  try {
    const res = await page.goto(p.url, { waitUntil: "load", timeout: 30_000 });
    if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status() ?? "no response"}`);
    await page.waitForTimeout(SETTLE_MS);
    return await page.screenshot({ type: "jpeg", quality: 72 });
  } finally {
    await context.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const only = new Set(args.filter((a) => !a.startsWith("--")));
  const projects = parseList(readFileSync(join(ROOT, "data/projects.yaml"), "utf8"), "data/projects.yaml");
  const todo = projects.filter((p) => (only.size ? only.has(p.id) : all || !hasShot(p.id)));
  if (!todo.length) return console.log("Every entry has a picture.");
  mkdirSync(SHOTS, { recursive: true });

  const live = todo.filter(isLive);
  const { chromium } = live.length ? await import("playwright") : {};
  const browser = live.length ? await chromium.launch() : null;
  const failed = [];
  try {
    for (const p of todo) {
      try {
        const buf = isLive(p) ? await screenshot(browser, p) : await repoCard(p);
        clear(p.id);
        writeFileSync(join(SHOTS, `${p.id}.${isLive(p) ? "jpg" : "png"}`), buf);
        console.log(`saved ${p.id} (${isLive(p) ? "screenshot" : "repo card"}, ${Math.round(buf.length / 1024)} KB)`);
      } catch (err) {
        failed.push(p.id);
        console.log(`skipped ${p.id}: ${err.message.split("\n")[0]}`);
      }
    }
  } finally {
    await browser?.close();
  }
  console.log(`${todo.length - failed.length} saved, ${failed.length} skipped${failed.length ? ` (${failed.join(", ")})` : ""}.`);
}

await main();
