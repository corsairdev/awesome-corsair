#!/usr/bin/env node
// Generates the entry list in README.md and data/built-with.json from data/*.yaml.
// Usage:
//   node scripts/build.mjs          rewrite README.md and data/built-with.json
//   node scripts/build.mjs --check  fail if either is out of date (CI)
//
// Zero dependencies, so a contributor can run it with a bare Node. Adapted from monid-ai/awesome-monid's
// scripts/build.mjs (CC0).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const README = join(ROOT, "README.md");
const SHOWCASE = join(ROOT, "data/built-with.json");
const BEGIN = "<!-- BEGIN GENERATED -->";
const END = "<!-- END GENERATED -->";

/* A minimal YAML reader for the one shape used here: a list of flat maps. It supports "- key: value",
   "  key: value", [a, b], "quoted strings", true/false and whole-line # comments. */
function parseList(text, file) {
  const out = [];
  let cur = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) return;
    const at = (msg) => `${file}:${i + 1}: ${msg}`;
    let body = line;
    if (/^- /.test(line)) {
      cur = {};
      out.push(cur);
      body = line.slice(2);
    } else if (/^\s+\S/.test(line)) {
      if (!cur) throw new Error(at("key outside of any list item"));
      body = line.trim();
    } else {
      throw new Error(at(`cannot parse: ${line}`));
    }
    const m = body.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!m) throw new Error(at(`expected "key: value", got: ${body}`));
    const [, key, rawValue] = m;
    if (key in cur) throw new Error(at(`duplicate key "${key}"`));
    cur[key] = parseScalar(rawValue, at);
  });
  return out;
}

function parseScalar(v, at) {
  const s = v.trim();
  if (s === "") return "";
  if (s.startsWith("[")) {
    if (!s.endsWith("]")) throw new Error(at("unterminated inline list"));
    const inner = s.slice(1, -1).trim();
    return inner ? inner.split(",").map((x) => parseScalar(x, at)) : [];
  }
  if (s === "true") return true;
  if (s === "false") return false;
  if (s.startsWith('"') && s.endsWith('"') && s.length > 1) return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  if (s.startsWith("'") && s.endsWith("'") && s.length > 1) return s.slice(1, -1);
  return s;
}

const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// Metadata in backticks rather than emoji: `hosted` `TypeScript` needs no legend. `oss` prints nothing, since the
// Source Code link already says it.
const KIND = { hosted: "hosted", oss: null, skill: "skill", writeup: "write-up" };
const LANG = { py: "Python", ts: "TypeScript", js: "JavaScript", go: "Go", rust: "Rust", other: null };

// Our own work does not go on the list: the corsairdev org and the people on the Corsair team.
const OURS = /^(corsairdev|devjain32|PranayHaldiya|yuvrxj-afk|Dhirenderchoudhary|ambikeesshh|Corsair-ops)\//i;

function validate(projects, categories) {
  const errors = [];
  const ids = new Set();
  const catIds = new Set(categories.map((c) => c.id));
  const required = ["id", "name", "url", "repo", "author", "category", "kind", "description", "added", "evidence"];
  for (const p of projects) {
    const where = p.id || p.name || "(unnamed entry)";
    const bad = (msg) => errors.push(`${where}: ${msg}`);
    for (const f of required) {
      if (p[f] === undefined || p[f] === "" || (Array.isArray(p[f]) && !p[f].length)) bad(`missing required field "${f}"`);
    }
    if (p.id) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) bad("id must be kebab-case");
      if (ids.has(p.id)) bad("duplicate id");
      ids.add(p.id);
    }
    if (p.category && !catIds.has(p.category)) bad(`unknown category "${p.category}"`);
    if (p.repo && OURS.test(p.repo)) bad("this is the Corsair team's own work, it does not go on the list");
    for (const k of asArray(p.kind)) if (!(k in KIND)) bad(`unknown kind "${k}"`);
    for (const l of asArray(p.lang)) if (!(l in LANG)) bad(`unknown lang "${l}"`);
    if (p.url && !/^https?:\/\/\S+$/.test(p.url)) bad("url must be an absolute http(s) URL");
    if (p.repo && !/^[\w.-]+\/[\w.-]+$/.test(p.repo)) bad('repo must be "owner/name"');
    if (p.added && !/^\d{4}-\d{2}-\d{2}$/.test(p.added)) bad("added must be YYYY-MM-DD");
    if (p.verified !== undefined && typeof p.verified !== "boolean") bad("verified must be true or false");
    const d = p.description;
    if (typeof d === "string" && d) {
      if (!/^[A-Z0-9]/.test(d)) bad("description must start with a capital letter or a digit");
      if (!d.endsWith(".")) bad("description must end with a period");
      if (d.length > 160) bad(`description is ${d.length} chars, max 160`);
      if (/\p{Extended_Pictographic}/u.test(d)) bad("description must not contain emoji");
      if (/—|–/.test(d)) bad("description must not contain an em dash or en dash");
      if (/\.\s+[A-Z]/.test(d)) bad("description must be a single sentence");
    }
  }
  return errors;
}

// github-slugger's rules, which GitHub uses for heading anchors.
const slug = (heading) => heading.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s/g, "-");
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "gmail, googlecalendar +3": the plugins a project uses, short enough for one line. */
function usesTag(p) {
  const list = asArray(p.corsair).filter((x) => !/^plus-\d+-more$/.test(x));
  const extra = asArray(p.corsair).map((x) => x.match(/^plus-(\d+)-more$/)?.[1]).find(Boolean);
  if (!list.length) return null;
  const more = list.length - 3 + (extra ? Number(extra) : 0);
  return `uses ${list.slice(0, 3).join(", ")}${more > 0 ? ` +${more}` : ""}`;
}

function renderEntry(p) {
  const repoUrl = p.repo ? `https://github.com/${p.repo}` : "";
  const bits = [`- [${p.name}](${p.url}) - ${p.description}`];
  if (repoUrl && p.url.replace(/\/$/, "") !== repoUrl) bits.push(`([Source Code](${repoUrl}))`);
  const tags = [...asArray(p.kind).map((k) => KIND[k]), ...asArray(p.lang).map((l) => LANG[l]), usesTag(p), p.event].filter(Boolean);
  if (tags.length) bits.push(tags.map((t) => `\`${t}\``).join(" "));
  return bits.join(" ");
}

const COLOR = "4a38f5";

function renderStats(projects) {
  const live = projects.filter((p) => asArray(p.kind).includes("hosted")).length;
  const cats = new Set(projects.map((p) => p.category)).size;
  const badge = (label, value) => `![${label}](https://img.shields.io/badge/${encodeURIComponent(label)}-${value}-${COLOR}?style=flat-square)`;
  return ["<div align=\"center\">", "", [badge("projects", projects.length), badge("live apps", live), badge("categories", cats), "[![Awesome](https://awesome.re/badge-flat2.svg)](https://awesome.re)"].join(" "), "", "</div>", ""].join("\n");
}

function renderNav(projects, categories) {
  const used = categories.filter((c) => projects.some((p) => p.category === c.id));
  const cells = used.map((c) => {
    const n = projects.filter((p) => p.category === c.id).length;
    return `<td><a href="#${slug(c.title)}">${escapeHtml(c.title)}</a> <sub>${n}</sub></td>`;
  });
  const rows = [];
  for (let i = 0; i < cells.length; i += 3) rows.push(`  <tr>${cells.slice(i, i + 3).join("")}</tr>`);
  return ["<div align=\"center\">", "", "<table>", ...rows, "</table>", "", "</div>", ""].join("\n");
}

function renderCategorised(projects, categories) {
  const lines = [];
  for (const c of categories.filter((c) => projects.some((p) => p.category === c.id))) {
    const rows = projects.filter((p) => p.category === c.id).sort((a, b) => a.name.localeCompare(b.name));
    lines.push(`### ${c.title}`, "", `<sub>${escapeHtml(c.blurb)}</sub>`, "", ...rows.map(renderEntry), "", "<sup>[back to top](#readme)</sup>", "");
  }
  return lines.join("\n");
}

/** What a site (corsair.dev/built-with) reads: the same entries as the README, as JSON. */
function showcase(projects, categories) {
  return `${JSON.stringify(
    {
      source: "https://github.com/corsairdev/awesome-corsair",
      categories: categories.map((c) => ({ id: c.id, title: c.title, blurb: c.blurb })),
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        url: p.url,
        repo: p.repo,
        author: p.author,
        category: p.category,
        kind: asArray(p.kind),
        lang: asArray(p.lang).map((l) => LANG[l]).filter(Boolean),
        corsair: asArray(p.corsair),
        description: p.description,
        event: p.event || "",
        hosted: asArray(p.kind).includes("hosted") && !/github\.com/.test(p.url),
        added: p.added,
        verified: p.verified === true,
      })),
    },
    null,
    2,
  )}\n`;
}

function build() {
  const categories = parseList(readFileSync(join(ROOT, "data/categories.yaml"), "utf8"), "data/categories.yaml");
  const projects = parseList(readFileSync(join(ROOT, "data/projects.yaml"), "utf8"), "data/projects.yaml");
  const errors = validate(projects, categories);
  if (errors.length) {
    console.error(`Validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    process.exit(1);
  }

  const body = [renderStats(projects), renderNav(projects, categories), renderCategorised(projects, categories)].join("\n");
  const readme = readFileSync(README, "utf8");
  const start = readme.indexOf(BEGIN);
  const stop = readme.indexOf(END);
  if (start === -1 || stop === -1) {
    console.error(`README.md is missing the ${BEGIN} / ${END} markers.`);
    process.exit(1);
  }
  const next = `${readme.slice(0, start + BEGIN.length)}\n\n${body}\n${readme.slice(stop)}`;
  const json = showcase(projects, categories);

  if (process.argv.includes("--check")) {
    const stale = [next !== readme && "README.md", (!existsSync(SHOWCASE) || readFileSync(SHOWCASE, "utf8") !== json) && "data/built-with.json"].filter(Boolean);
    if (stale.length) {
      console.error(`${stale.join(" and ")} out of date. Run \`npm run build\` and commit the result.`);
      process.exit(1);
    }
    console.log(`Up to date (${projects.length} entries).`);
    return;
  }
  writeFileSync(README, next, "utf8");
  writeFileSync(SHOWCASE, json, "utf8");
  console.log(`Wrote README.md and data/built-with.json: ${projects.length} entries across ${new Set(projects.map((p) => p.category)).size} categories.`);
}

build();
