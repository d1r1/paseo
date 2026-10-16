---
name: paseo-fork
description: Paseo fork UI map and landing path. Use when changing Paseo's UI in this fork (left sidebar, screens, Command Center, settings), showing a UI change in the fork desktop app beside the released app, or landing, checking or reverting a change in `d1r1/paseo`.
---

# Paseo fork

This checkout is `d1r1/paseo`, Desk's fork of Paseo. A UI change is made, shown beside the released app, checked, and landed by pull request into `desk`. The landing rules are in [CLAUDE.md](../../../CLAUDE.md#this-fork); this skill maps the UI and sequences the work.

## How a change arrives

A UI wish said in Desk's Manager tab becomes a Desk Issue. Desk's flow engine creates a workspace named `DSK-N <words>` with a worktree of this fork, branched from `origin/desk`, and an Issue manager drives the run. You work inside that worktree. The Issue is the scope: change what it names.

## Map

Paths are under `packages/app/src/`. The app is Expo (iOS, Android, web, Electron), so read [platform gating](../../../CLAUDE.md#platform-gating) before adding a DOM or native API.

| To change                                                                               | Start at                                                                                                          |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| The left sidebar frame: titlebar row, dev-build badge, footer rows, resize and collapse | `components/left-sidebar.tsx`                                                                                     |
| The sidebar's workspace list: projects, groups, drag order                              | `components/sidebar-workspace-list.tsx`                                                                           |
| Sidebar rows and their parts: workspace row, header rows, nav rows, status list, menus  | `components/sidebar/`                                                                                             |
| Which header and footer items show and in what order                                    | `sidebar-nav/model.ts`, read through `sidebar-nav/use-sidebar-nav-items.ts`                                       |
| The data a sidebar row shows                                                            | `hooks/use-sidebar-workspaces-list.ts` (list) and `hooks/sidebar-workspaces-view-model.ts` (row model)            |
| Sidebar display preferences (grouping, filters, labels), persisted                      | `stores/sidebar-view-store.ts`                                                                                    |
| The Sidebar settings page                                                               | `screens/settings/sidebar/`                                                                                       |
| A route or what a URL opens                                                             | `app/` (Expo Router; `app/h/[serverId]/` holds the per-host routes)                                               |
| A screen's content                                                                      | `screens/` (settings, new workspace, projects, schedules, sessions, workspace)                                    |
| Command Center (the palette): its UI, items, shortcuts                                  | `command-center/` (UI in `command-center.tsx`, items in `*-contributions.ts`, registered by `*-registration.tsx`) |
| Command Center items that plugins add                                                   | `plugins/command-center/`                                                                                         |

Reuse before adding: `components/ui/` holds the primitives (button, dropdown menu, status badge). Tokens live in `styles/theme.ts`.

Read the doc that owns the surface before editing it:

- [docs/design.md](../../../docs/design.md): tokens, hierarchy, density, states, what is forbidden. Every visual change.
- [docs/glossary.md](../../../docs/glossary.md): the UI label wins; use the glossary's terms in code and copy.
- [docs/expo-router.md](../../../docs/expo-router.md): before touching routes, startup routing or workspace restore.
- [docs/menus.md](../../../docs/menus.md), [docs/floating-panels.md](../../../docs/floating-panels.md), [docs/hover.md](../../../docs/hover.md), [docs/unistyles.md](../../../docs/unistyles.md): when the change involves a menu, popover, hover state or styles.
- [docs/qa.md](../../../docs/qa.md): the evidence bar for a pull request.

A change to user-facing copy touches the locale resources under `packages/app/src/i18n/`; [docs/i18n.md](../../../docs/i18n.md) says how.

## Show the change beside the released app

The released Paseo.app and its daemon on `127.0.0.1:6767` stay untouched: never restart, stop or replace them, and never read or write `~/.paseo`. The full recipe is [Running the fork beside the released app](../../../docs/development.md#running-the-fork-beside-the-released-app); the working rules:

1. An agent of the released Paseo inherits `PASEO_HOME=~/.paseo` (plus `PASEO_AGENT_ID`, `PASEO_AGENT_CWD` and `PASEO_CLI`) from the released daemon. With `PASEO_HOME` set, the dev scripts use that directory as the dev home and write `daemon.listen` into its `config.json` on every start, which is the released app's config. Run `env | grep '^PASEO_'` first, then start the app with every variable it lists removed from the command's environment. From the worktree root, in a terminal you own (a Paseo terminal or a background process):

   ```bash
   env -u PASEO_HOME -u PASEO_AGENT_ID -u PASEO_AGENT_CWD -u PASEO_CLI npm run dev:desktop
   ```

   Add `-u <name>` for any other `PASEO_*` variable the first command printed. The app starts Metro, Electron and a daemon on `127.0.0.1:6768`, with state in `<worktree>/.dev/paseo-home` and `<worktree>/.dev/user-data`.

2. Read the `Home:` line the runner prints before you go on. It must be `<worktree>/.dev/paseo-home`. If it shows `~/.paseo` or any other directory, press `Ctrl+C` at once, do not edit that directory, and tell the user that a start wrote `daemon.listen` into its `config.json`. Then start again with the variables removed.
3. Run it unseeded. A change to the UI needs no agents or projects from the released app. Never set `PASEO_DEV_SEED_HOME` for a UI change, and never resume a seeded agent in the dev app.
4. The expanded sidebar shows the current Git branch in a badge in the titlebar row (the dev-build label). That badge marks the fork window; the released app shows none.
5. Metro hot-reloads edits. Capture before and after screenshots of the dev window; [docs/browser-capture-harness.md](../../../docs/browser-capture-harness.md) covers Electron captures.
6. Stop only what you started: signal your runner (`Ctrl+C` in its terminal), then confirm `env -u PASEO_HOME -u PASEO_AGENT_ID -u PASEO_AGENT_CWD -u PASEO_CLI npm run cli -- daemon status` no longer finds a daemon on `6768`. Run every `npm run cli` command with those variables removed too: with `PASEO_HOME` set, the wrapper targets the released daemon. Confirm the process listening on `6767` has the same PID as before you started.

## Check the change

Run, from the worktree root:

1. `npm run format`, or `npm run format:files -- <changed files>` to leave unrelated files alone.
2. `npm run typecheck`. After a cross-package type error, rebuild first (`npm run build:server`) instead of patching types.
3. `npm run lint`.
4. `npx vitest run <changed test file> --bail=1` for each test file you changed or that sits beside the code you changed. Never run a whole suite locally; CI runs it.

Match the existing tests beside the code (`*.test.ts` next to the module) and follow [docs/testing.md](../../../docs/testing.md). Put screenshots and command output in the pull request, as [docs/qa.md](../../../docs/qa.md) asks.

## Land

Follow [Landing a change](../../../CLAUDE.md#landing-a-change): branch `<type>/<slug>` from `origin/desk`, `notary commit -m "…" --issue <id>`, `notary push --issue <id>`, then `gh pr create --repo d1r1/paseo --base desk`. The user merges. To undo a landed change, open a revert PR into `desk` as that section says.

Stop before commit unless the Issue's run says to commit. Do not edit `.gitleaks.toml` or `.gitleaksignore`, and keep the fork's `skills/` (upstream's published set) as it is.
