# session-statusbar

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/nathan-v/session-statusbar/blob/main/LICENSE)
[![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-orange.svg)](https://code.claude.com/docs)
[![CI](https://github.com/nathan-v/session-statusbar/actions/workflows/ci.yml/badge.svg)](https://github.com/nathan-v/session-statusbar/actions/workflows/ci.yml)
[![GitHub release (latest by date)](https://img.shields.io/github/v/release/nathan-v/session-statusbar)](https://github.com/nathan-v/session-statusbar/releases)
[![GitHub last commit](https://img.shields.io/github/last-commit/nathan-v/session-statusbar)](https://github.com/nathan-v/session-statusbar/commits/main)

session-statusbar is a Claude Code mod that draws one status line above the prompt. It shows the model in use, the advisor, how full the context window is, session token usage split by main session and agents, and what the session has cost so far.

It hooks the engine's own render and turn events, so the figures come from the same place `/cost` and `/context` read. Everything runs inside the session and nothing leaves your machine.

> **The full bar sits above the prompt.** The footer lines beside and below the prompt (the mode labels and the hint line) are short slots shared with Claude Code's own labels, and a full bar does not fit in them. Set `placement` to `hint` for a compact line under the prompt instead, or run `/statusbar` to open the same data in a docked pane if you would rather give up width than a row.

```
Model: Sonnet 5.5 | Advisor: Opus 5.5 | Context: ▰▱▱▱▱▱▱▱ 121k of 1M (12%) | Tokens: main 1.9M/11k, agents 45k/541, advisor 3 calls      Session cost total: $1.61 (Advisor ~$0.62)
```

## Contents

- [What it does](#what-it-does)
- [Quick Start](#quick-start)
- [What the bar shows](#what-the-bar-shows)
- [Placement](#placement)
- [Notes on the numbers](#notes-on-the-numbers)
- [Security Notice](#security-notice)
- [Status](#status)
- [Development](#development)
- [License](#license)

## What it does

- **Model and advisor.** Shows the main model and, when one is configured, the advisor. Claude ids turn into names (`claude-sonnet-5-5` becomes `Sonnet 5.5`); a custom model such as `claude --model gemini-4-argon` is shown exactly as configured.
- **Context fill.** Shows tokens in use against the model's window with a meter and a percentage, read from the engine's own context figures. The meter turns yellow at 70% and red at 90%, using your theme's colors.
- **Fits the terminal.** Cost sits on the right and the rest on the left. On a narrow terminal the bar drops tokens first, then the advisor, then the model, so context and cost stay the longest.
- **Above or under the prompt.** The `placement` setting picks `band` (the full colored bar above the prompt, the default), `hint` (a compact line appended to the hint line under the prompt) or `both`. The hint line keeps Claude Code's own pills, the permission mode among them, and the compact line is cut where the row ends, so it leads with the context meter and cost.
- **A pane on demand.** `/statusbar` opens a docked pane with the detail the bar has no room for: the context window by category, token totals, and the cost split. `/statusbar close` closes it.
- **Token usage by loop.** Keeps running input and output totals for the main session and for agents, and counts advisor calls.
- **Session cost.** Shows the session's API cost as `/cost` totals it, with an estimated advisor share next to it.
- **Drops what does not apply.** No advisor configured means the advisor field, call count and cost share disappear. A host with no price ledger (a custom unpriced model) loses the cost field.
- **No phoning home.** No analytics or metrics collection; this mod does _not_ call home in any way.

## Quick Start

Go ahead and install it from a terminal session:

```
/plugin install session-statusbar --marketplace nathan-v/session-statusbar
```

Answer `y` to add the marketplace, then pick a scope. The bar shows up in that session straight away and in each new session after. From a shell the same install is:

```bash
claude plugin install session-statusbar --marketplace nathan-v/session-statusbar
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `nathan-v/session-statusbar`, then Add plugin.

To try it without installing, clone the repo and point a session at the folder:

```bash
git clone https://github.com/nathan-v/session-statusbar.git
claude --plugin-dir ./session-statusbar
```

## What the bar shows

| Field | Example | Meaning |
|-------|---------|---------|
| `Model` | `Sonnet 5.5` | The main loop's model, as `/model` shows it |
| `Advisor` | `Opus 5.5` | The `advisorModel` from your settings (user file first); set it with `/advisor` |
| `Context` | `▰▱▱▱▱▱▱▱ 121k of 1M (12%)` | Input tokens of the last response against the model's window |
| `Tokens` | `main 1.9M/11k` | Session input/output totals for the main loop, then for agents |
| `advisor` | `3 calls` | How many times the advisor ran this session |
| `Session cost total` | `$1.61 (Advisor ~$0.62)` | The session's API cost, plus an estimated advisor share |

## Placement

Run `/config` and set the `placement` row for `session-statusbar` to `band`, `hint` or `both`. The change reloads the mod with the new value. The install screen offers the same picker the first time you add the mod.

The `hint` line is plain dim text, so it has no color, and it shows only what fits beside the engine's own hint. The `band` is the full bar with color and the narrow-terminal fitting described above.

## Notes on the numbers

- **Input totals are large on purpose.** Input counts uncached, cache-written and cache-read tokens for every request, so a 120k context re-sent across a dozen steps adds up to well over a million. That is traffic; `Context` is the figure for how full the window is.
- **Totals start when the mod loads.** The bar counts turns finished since it loaded, so a session that was already running, or one you resumed with `--resume` or `--continue`, will read lower than `/cost` until it restarts.
- **The advisor has no token counts.** The API reports no tokens or price for the advisor, so the bar shows its call count. The `~` cost is an estimate: the extra cost of main-loop steps that called the advisor over the average main-loop step. It reads $0 until a few ordinary steps give it an average, restarts that average when the mod reloads, and can land a step late. Treat it as a rough size, and compare it with the advisor model's line in `/cost` if you want to know how rough.
- **Cost can trail `/cost` briefly.** The bar redraws as the session changes, so a reading taken mid-turn can sit a response behind.

## Security Notice

- **It runs code inside your session.** A mod is a hooks module with access to the engine's `$` interface. This one reads the session's model, context and cost figures and the `advisorModel` key from your settings, and keeps its totals in the session's own state. It makes no network calls and writes no files. Read the source before you install any mod; this one is a single file at `hooks/register.tsx`.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Status

Early, version 0.1.0. The agent token totals, advisor call count and session cost have been checked against `/cost` and the session transcript; context is read straight from the engine's figure. The advisor cost estimate is a heuristic and is labeled as one.

## Development

```bash
claude plugin validate .             # manifest, marketplace and hooks module
claude plugin test .                 # statusbar.test.tsx against the engine's test kit
claude --plugin-dir .                # run a session with the mod loaded from this folder
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow.

## License

MIT; see [LICENSE](LICENSE). PRs and constructive feedback are welcome.
