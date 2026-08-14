# build-monitor

Checks that every build listed in `builds.json` is still answering, every 6 hours,
and writes the result to `status.json`.

`machines-words.com/luno` reads `status.json` directly and shows the outcome next to
each build. That page makes a claim about things being live. This is the thing that
checks whether the claim is still true.

## Why it exists

A list of links on a page is an assertion. Links rot. Preview deployments get removed.
Claiming 18 live builds and then serving a 404 behind one of them is worse than never
having linked it at all, so the claim needed something underneath it.

## How it works

| | |
|---|---|
| Trigger | GitHub Actions cron, every 6 hours, plus manual dispatch |
| Method | HTTP GET, redirects followed, 20 second timeout |
| Retry | 2 attempts before a URL is recorded as down |
| Concurrency | 6 at a time |
| Output | `status.json`, committed only when the result changes |

## It reports failures

The job exits 0 whether everything is up or not, because a red status is a true result
and not a broken job. If a build goes down, `status.json` says so, the commit history
records when it happened, and the page shows it.

A monitor that can only report success is decoration. Every check ever run is in the
commit log of this repository, including the unflattering ones.

## Verifying it yourself

Everything here is readable. `check.mjs` is the whole checker, `.github/workflows/check.yml`
is the whole schedule, and the commit history is the whole record.

```bash
node check.mjs   # needs Node 18 or newer, no dependencies
```
