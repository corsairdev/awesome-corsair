# Contributing

## How to submit

Open a pull request that adds one entry to [`data/projects.yaml`](data/projects.yaml).

1. Fork the repo.
2. Add your entry to `data/projects.yaml`, using the template below.
3. Run `npm run build` (Node 18 or later, nothing to install). It regenerates `README.md` and `data/built-with.json` from the data, and CI fails if you skip it.
4. Commit all three files and open the pull request. One project per pull request.

You don't add a picture. Once your entry is merged, a workflow takes a screenshot of your live app (or uses GitHub's card for your repo if the entry has no live app) for the card on [corsair.dev/built-with](https://corsair.dev/built-with). If yours caught the page half loaded, open an issue and we'll take it again.

```yaml
- id: your-project
  name: Your Project
  url: https://example.com
  repo: owner/name
  author: "@yourhandle"
  category: email-calendar
  kind: [hosted, oss]
  lang: [ts]
  corsair: [gmail, googlecalendar]
  evidence: package.json has @corsair-dev/gmail; createCorsair in src/lib/corsair.ts
  description: One sentence that says what it does and ends with a period.
  created: 2026-06-14
  added: 2026-11-20
```

The reader in `scripts/build.mjs` is small: it skips a line that starts with `#`, but a `# note` after a value breaks the build.

What each field takes:

- `id`: kebab-case, unique, never reused.
- `name`: the display name, no marketing suffix.
- `url`: what a reader should open first, the live app or the repo.
- `repo`: `owner/name` on GitHub.
- `author`: how you want to be credited.
- `category`: an id from [`data/categories.yaml`](data/categories.yaml).
- `kind`: one or more of `hosted`, `oss`, `skill`, `writeup`.
- `lang`: one or more of `py`, `ts`, `js`, `go`, `rust`, `other`, or `[]`.
- `corsair`: the Corsair plugins it uses (`gmail`, `slack`, `linear`…), plus `mcp` if it uses the MCP server or URL.
- `evidence`: where anyone can check the Corsair use, as a file and what it holds.
- `description`: one sentence, 160 characters at most, ending with a period. No marketing words, emoji or dashes.
- `created`: the repo creation date.
- `added`: the day you open the pull request.
- `event`: optional, the hackathon or cohort it was built for.

Leave `verified` out. A maintainer sets it after opening the link and checking the evidence.

Don't edit `README.md` between the `BEGIN GENERATED` and `END GENERATED` markers: the next build overwrites it. You can submit a project you didn't build; credit its author in `author`.

## What gets in

An entry has to clear all of these:

1. **Built outside the Corsair team.** Repos under `corsairdev` and by people on the team are rejected by the build.
2. **Uses Corsair in a way anyone can see:** a `corsair` or `@corsair-dev/*` dependency, Corsair imports in the code, or the Corsair MCP URL (or a Lug URL) in its config. A link to corsair.dev in a README isn't enough.
3. **A real project.** Not an empty repo, an unchanged tutorial, a copy of an example repo, or a bare test.
4. **Not a fork and not archived.**
5. **Reachable.** The link opens. A hosted app that has been down for weeks comes off the list.

Stars don't matter. A small project that does one thing well is welcome.

## The sweep

Every three days a workflow ([`.github/workflows/sweep.yml`](.github/workflows/sweep.yml), code in [`tools/sweep`](tools/sweep/run.mjs)) searches GitHub for code that uses Corsair, asks Claude to grade each new repo against the rules above, and opens one pull request with the drafts. A maintainer checks each one before it merges. [`data/sweep-state.json`](data/sweep-state.json) records every repo it graded, so a rejected repo is looked at again only after 60 days.

You don't need to wait for it: a pull request from you is read the same way.

## Taking an entry off

Open an issue or a pull request that removes it. If it's your project, that's all it takes.
