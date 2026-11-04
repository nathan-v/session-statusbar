# Contributing

## Code Style

The mod is TypeScript (`hooks/register.tsx`) and has no separate linter. The Claude Code CLI is the lint step: it reads the manifest, the marketplace file and the hooks module the way the engine will, and reports what the engine would refuse.

```bash
claude plugin validate .
```

Keep module state in `$.state` (declared in `types/index.d.ts`), not in module variables, since a reload resets variables. The one exception is the advisor cost estimator's working state (`seen`, `lastCost`, `mainSum`, `mainN`), which restarts its baseline on reload on purpose. The module has no DOM or Node, so reach everything outside it through `$`, and pass `$` only into functions declared at the top of the file (the engine refuses it anywhere else).

The slash command is `/statusbar`. `/session` is a name Claude Code ships, and the engine refuses to register it.

## Claude Code Versions

The mod targets the current Claude Code release. It uses the `$` interface and `claude-code/testing` kit that ship with the CLI, so an older CLI that lacks them will not load it.

## Developer Setup

```bash
git clone https://github.com/nathan-v/session-statusbar.git
cd session-statusbar
claude --plugin-dir .      # start a session with the mod loaded from this folder
```

Saves from your editor reload within a second or so; edits the session itself makes reload when its turn ends.

## Testing

```bash
claude plugin test .
```

Unit tests should be included with every PR. If the PR is a bug fix, please include a regression test as well. The unit test suite must not require live backing services; the test kit stands in for the engine, so tests state what `session.model`, `session.usage` and `settings.read` answer.

The tests cover rendering: the bar, its narrow-terminal fitting, model naming, the fallbacks for a custom model, and the pane. The `turn.step` and `turn.complete` counting and the advisor cost estimate are not covered yet, and a PR that adds them is welcome. PRs that reduce coverage should include justification.

## Pull Request Process

1. Make sure `claude plugin validate .` passes
2. Make sure all tests pass
3. Update the README if your change affects what the bar shows
4. Reference any related issues in your PR description
