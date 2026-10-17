# Development

## Prerequisites

- Node.js (see `.tool-versions` for exact version)
- npm workspaces (comes with Node)

## Running the dev server

```bash
npm run dev:server
npm run dev:app
npm run dev:desktop
```

Root checkout dev is intentionally split across terminals:

- `npm run dev:server` runs the daemon on `127.0.0.1:6768`.
- `npm run dev:app` runs Expo on `http://localhost:8081` and connects to the dev daemon.
- `npm run dev:desktop` runs its own Electron-flavored Expo server on the first free port from `8082` through `8089`. It never claims port `8081`.

Desktop dev launches its desktop-managed daemon with `PASEO_NODE_ENV=development`,
so development-only providers such as Mock Load Test are available. Packaged
desktop launches always force the daemon to production mode.

The web and desktop dev launchers pass the current Git branch to Metro as
`EXPO_PUBLIC_PASEO_DEV_BUILD_LABEL`. The expanded desktop sidebar shows it in
the titlebar row. Production builds leave the variable unset and show no label.

`npm run dev` is only a shorthand for `npm run dev:server`. Keep `127.0.0.1:6767` for the packaged app and production-style `~/.paseo` state.

## Nix desktop package

The flake exposes `packages.<system>.desktop` on Linux and macOS:

```bash
nix build .#desktop
```

Linux produces the `paseo-desktop` launcher and desktop entry. macOS produces
`Applications/Paseo.app` plus the `paseo-desktop` launcher. Both use the nixpkgs
Electron runtime and the checkout's built daemon, client, and renderer rather
than downloading a published desktop release.

### PASEO_HOME

`PASEO_HOME` is the directory that holds runtime state (agents, worktrees, workspace config, sockets, daemon log). Resolution rules:

- The **server itself** (e.g. when launched by the desktop app or `npm run start`) defaults to `~/.paseo` (see `packages/server/src/server/paseo-home.ts`).
- **Repo dev scripts** default to `$ROOT/.dev/paseo-home`, where `$ROOT` is the current checkout or worktree root. This keeps all dev state scoped to the checkout instead of the packaged desktop app.
- **`npm run cli -- ...`** runs through the same dev-home wrapper as the dev scripts, so the in-repo CLI automatically targets the current checkout's `.dev/paseo-home` and configured dev daemon endpoint.
- **Paseo-created worktrees** seed `$PASEO_WORKTREE_PATH/.dev/paseo-home` from `$PASEO_SOURCE_CHECKOUT_PATH/.dev/paseo-home` by copying durable JSON metadata. Runtime files like pid files, sockets, and logs are not copied.
- **This repo's worktree setup** also best-effort seeds `packages/app/ios` and the newest `.dev/ios-build` entry from the source checkout so iOS simulator services can reuse native project and Xcode cache state when it is safe enough to do so.

Override knobs:

```bash
PASEO_HOME=~/.paseo-blue npm run dev          # explicit home
PASEO_DEV_SEED_HOME=/path/to/home npm run dev # seed from a different source home
PASEO_DEV_RESET_HOME=1 npm run dev            # clear and reseed the derived worktree home
```

### Daemon endpoints

- Stable daemon launched by the desktop app: `localhost:6767`.
- Root checkout dev daemon: `localhost:6768`.
- Root checkout Expo: `http://localhost:8081`.
- Root checkout desktop dev Expo: first free port from `8082` through `8089`.
- `npm run dev` (Windows): `localhost:6767` for the daemon.

In Paseo-managed worktree services, use the injected service environment rather than hardcoded root checkout ports.

### Running the fork beside the released app

`npm run dev:desktop` runs this checkout's Electron app and daemon next to the released Paseo.app. The two share nothing unless you point one at the other's state.

- **Port.** `packages/desktop/scripts/dev.sh` defaults `PASEO_LISTEN` to `127.0.0.1:6768`, and the `dev:desktop` script in `package.json` sets the same value. The released app keeps `6767`.
- **Home.** With `PASEO_HOME` unset, `scripts/dev-home.sh` (`configure_dev_paseo_home`) uses `<checkout>/.dev/paseo-home`. It writes `daemon.listen` and `daemon.cors.allowedOrigins` into that home's `config.json` on every start (`configure_dev_daemon_config`). If the environment has `PASEO_HOME`, the script uses that directory instead. An agent of the released Paseo inherits `PASEO_HOME=~/.paseo` (plus `PASEO_AGENT_ID`, `PASEO_AGENT_CWD` and `PASEO_CLI`) from the released daemon, so a plain start from an agent tab runs on the released app's home and rewrites its `config.json`. Start with the variables removed; add `-u` for any other `PASEO_` variable that `env | grep '^PASEO_'` lists:

  ```bash
  env -u PASEO_HOME -u PASEO_AGENT_ID -u PASEO_AGENT_CWD -u PASEO_CLI npm run dev:desktop
  ```

  Before you go on, check that the `Home:` line the runner prints (`packages/desktop/scripts/dev.sh`) is `<checkout>/.dev/paseo-home`. If it shows `~/.paseo` or any other directory, press `Ctrl+C` and start again with the variables removed.

- **Electron user data.** `<checkout>/.dev/user-data` (`dev-runtime-config.mjs`, applied through `PASEO_ELECTRON_USER_DATA_DIR` in `main.ts`). The released app's user data is not touched.
- **No seeding by default.** The dev home starts empty. `scripts/dev-home.sh` seeds it only when `PASEO_DEV_SEED_HOME` is set, and nothing in the repo sets it. To start with the released app's agents and projects:

  ```bash
  env -u PASEO_HOME -u PASEO_AGENT_ID -u PASEO_AGENT_CWD -u PASEO_CLI PASEO_DEV_SEED_HOME=~/.paseo npm run dev:desktop
  ```

  The seed copies the `*.json` files under `agents/` and `projects/`, plus `config.json`, and nothing else, so plugins, the daemon log, pid files and sockets stay behind. `config.json` carries the released daemon's settings into the dev home, and `daemon.listen` is then rewritten to `6768`.

- **Later runs.** The seed runs once. A home that already has any file in it is kept as it is, even when `PASEO_DEV_SEED_HOME` is set (`has_files`). That includes a home an earlier unseeded run created. `PASEO_DEV_RESET_HOME=1` (with the same `env -u` prefix) deletes the dev home and seeds it again.
- **Stopping.** Press `Ctrl+C` in the terminal that runs `npm run dev:desktop`. The runner (`dev-runner.mjs`) stops Metro and Electron, and Electron stops its daemon on quit unless the desktop setting `daemon.keepRunningAfterQuit` is on (`quit-lifecycle.ts`). To check or stop the dev daemon by hand, use the CLI below.
- **CLI.** `npm run cli -- ls -a -g` targets the dev home (`scripts/dev-home.sh`). `npm run cli -- daemon status` shows which daemon answers. Run `npm run cli` with the same `env -u` prefix: with `PASEO_HOME` set, the wrapper targets the released daemon. An installed `paseo` CLI defaults to `~/.paseo`, the released daemon, so point it at the dev home with `PASEO_HOME=<checkout>/.dev/paseo-home` or `--home <checkout>/.dev/paseo-home`. `--home` and `--host` cannot be combined, and neither can `PASEO_HOME` and `PASEO_HOST` (`packages/cli/src/utils/daemon-target.ts`).

**Do not resume or prompt a seeded agent from the dev app.** A seeded agent record keeps its `persistence` handle (`docs/data-model.md`), which points at the same provider session the released daemon drives. Resuming it in the dev app starts a second daemon writing to that one session. Create new agents in the dev app instead, and treat the seeded list as read-only.

### Installing the fork app over the released one

The fork builds its own `Paseo.app` and takes the place of `/Applications/Paseo.app`. It keeps the app id `sh.paseo.desktop`, so it reads the released app's `~/.paseo`, its Electron user data (`desktop-settings.json`, including `boardFilePath`) and the `~/.local/bin/paseo` symlink, which points into `/Applications/Paseo.app`. Its built-in daemon is the fork's. Nothing here is automated: an agent builds the app, and you do the rest.

What makes it the fork build:

- **Version.** The fork carries `0.11.4-desk.1`, the upstream version plus `-desk.N`, in the root `package.json` and every workspace `package.json` (`node scripts/sync-workspace-versions.mjs` copies the root value to the workspaces). The bundled CLI, the daemon and the app read their own package's version, so a single root bump makes `paseo --version`, `Info.plist` and the About page agree. `packages/app/native-release-version.js` accepts the `-desk.N` suffix as a stable release; Expo refuses any other suffix. When you merge a new upstream release, set the root version to `<upstream>-desk.1` again and run the sync script.
- **Signing.** `packages/desktop/electron-builder.fork.yml` extends `electron-builder.yml` and signs ad-hoc (`identity: "-"`) with the Hardened Runtime off, because library validation rejects ad-hoc-signed frameworks. It does not notarize, so it needs no Apple account or keychain. The app opens on the Mac that built and installed it. A copy that came through a download carries a quarantine flag and is blocked: run `xattr -dr com.apple.quarantine <app>` on it.
- **No auto-update.** The overlay sets `publish: null`, so the bundle has no `app-update.yml`. The packaged app never finds or downloads an upstream release; with no feed, its update check can only fail. You take a new upstream release by merging upstream into `desk` and building again.

#### Build

From the worktree root, in a terminal you own. Remove the inherited `PASEO_*` variables as in [Running the fork beside the released app](#running-the-fork-beside-the-released-app); the build does not read them, but this keeps the habit:

```bash
env -u PASEO_HOME -u PASEO_AGENT_ID -u PASEO_AGENT_CWD -u PASEO_CLI npm run build:desktop:fork
```

The output is `packages/desktop/release/mac-arm64/Paseo.app` (Apple Silicon only). The script is `build:desktop` with `--config electron-builder.fork.yml --mac dir --arm64`; `--mac dir` replaces the base file's dmg and zip targets, because electron-builder concatenates `target` lists across `extends`. Check the result before you install it, without opening the app:

```bash
APP=packages/desktop/release/mac-arm64/Paseo.app
codesign -dv --verbose=4 "$APP" 2>&1 | grep -E 'Identifier|Signature'   # Identifier=sh.paseo.desktop, Signature=adhoc
codesign --verify --deep --strict "$APP" && echo signature ok
defaults read "$PWD/$APP/Contents/Info" CFBundleShortVersionString         # 0.11.4-desk.1
"$APP/Contents/Resources/bin/paseo" --version                              # 0.11.4-desk.1
ls "$APP/Contents/Resources/app-update.yml"                                # must fail: no such file
```

#### Before the switch

Do this from a terminal outside Paseo (Terminal.app): quitting Paseo ends the terminals and agents that run inside it. The switch needs a moment when no agent is running; the agents you want to keep resume afterwards from their saved sessions.

1. Save what the released app reports, while it still runs:

   ```bash
   mkdir -p ~/paseo-switch
   paseo --version                > ~/paseo-switch/version-before.txt
   paseo ls -a -g                 > ~/paseo-switch/agents-before.txt
   paseo plugin ls                > ~/paseo-switch/plugins-before.txt
   paseo provider ls              > ~/paseo-switch/providers-before.txt
   readlink ~/.local/bin/paseo    > ~/paseo-switch/symlink-before.txt
   ```

   Read `agents-before.txt` and stop agents that are still working; wait for the ones you cannot interrupt.

2. Quit the released app (`Paseo` > Quit, or `osascript -e 'quit app "Paseo"'`), then make sure its daemon is gone. Quit stops the daemon unless the desktop setting `daemon.keepRunningAfterQuit` is on:

   ```bash
   paseo daemon status      # if it still reports a running daemon:
   paseo daemon stop
   ```

3. Back up `~/.paseo` with nothing running, and check the copy:

   ```bash
   BACKUP=~/.paseo-backup-$(date +%Y%m%d-%H%M)
   rsync -a --exclude /worktrees ~/.paseo/ "$BACKUP"/
   diff -rq -x worktrees ~/.paseo "$BACKUP" && echo backup identical
   ```

   The backup holds agents, projects, plugins and `config.json`. It leaves out `~/.paseo/worktrees`: the switch does not touch those checkouts, and with their `node_modules` a full copy takes very long. Keep the backup until the fork has run well for a while.

#### Switch

1. Check what you are about to move, and move it aside rather than delete it. The saved app is the rollback:

   ```bash
   defaults read /Applications/Paseo.app/Contents/Info CFBundleShortVersionString   # 0.11.4
   mkdir -p ~/Applications
   test ! -e ~/Applications/Paseo-0.11.4.app.bak && mv /Applications/Paseo.app ~/Applications/Paseo-0.11.4.app.bak
   ```

   If the `test` fails, `~/Applications/Paseo-0.11.4.app.bak` already exists; look at it before you pick another name.

2. Copy the fork app in. `ditto` keeps the signature and the bundle's symlinks:

   ```bash
   ditto packages/desktop/release/mac-arm64/Paseo.app /Applications/Paseo.app
   codesign --verify --deep --strict /Applications/Paseo.app && echo signature ok
   ```

3. Open it: `open /Applications/Paseo.app`. The built-in daemon starts on `127.0.0.1:6767` with `~/.paseo`. macOS asks again for the permissions the released app had (files, network, accessibility, notifications), because the signing identity changed; grant them as you did before.

#### Checks after the switch

These are yours to run; the build does not prove them.

```bash
readlink ~/.local/bin/paseo      # /Applications/Paseo.app/Contents/Resources/bin/paseo, same as symlink-before.txt
paseo --version                  # 0.11.4-desk.1
paseo daemon status              # running; home is ~/.paseo
paseo ls -a -g > ~/paseo-switch/agents-after.txt
diff <(awk 'NR>1 {print $1}' ~/paseo-switch/agents-before.txt | sort) <(awk 'NR>1 {print $1}' ~/paseo-switch/agents-after.txt | sort)
paseo plugin ls   | diff ~/paseo-switch/plugins-before.txt -
paseo provider ls | diff ~/paseo-switch/providers-before.txt -
```

The agent list must hold the same agent ids. `paseo ls` shows the 200 newest agents, so an agent that existed only before the switch pushes an old one out of the window, and the diff shows one id on each side. Such an agent is a short-lived one that was running when you saved the list, for example a `Herald summary`; `paseo agent inspect <id>` then reports `Agent not found`. Any other missing id is a lost agent. Open one agent from the list and send it a prompt: it continues its own session. Settings > About shows `0.11.4-desk.1`. If `~/.local/bin/paseo` is missing or points elsewhere, press Install under Settings > Integrations > Command line.

#### Roll back

One step puts the released 0.11.4 app back. Quit the fork app (and `paseo daemon stop` if a daemon remains), then:

```bash
mv /Applications/Paseo.app ~/Applications/Paseo-fork.app && mv ~/Applications/Paseo-0.11.4.app.bak /Applications/Paseo.app
open /Applications/Paseo.app
```

`~/.local/bin/paseo` points at the same path and needs nothing. `~/.paseo` stays as the fork's daemon left it. Both versions share the upstream `0.11.4` state format, so this normally works as it is.

Restoring the backup is a separate step, for when you want the state from before the switch as well. It discards everything the fork wrote since. Quit the app and its daemon first:

```bash
mv ~/.paseo ~/.paseo-after-fork
rsync -a "$BACKUP"/ ~/.paseo/   # $BACKUP is the directory from step 3; list ~/.paseo-backup-* if the shell lost it
mv ~/.paseo-after-fork/worktrees ~/.paseo/worktrees
```

The backup has no `worktrees`, so the last line moves the checkouts back from the fork's state.

Delete `~/Applications/Paseo-fork.app` and `~/.paseo-after-fork` when you no longer need them. If a rollback follows a failed first launch, `~/Applications/Paseo-fork.app` is the fork build; rebuild from the worktree instead of repairing it.

### Desk's board in the sidebar

In the desktop app, the sidebar can list workspaces in the order of Desk's board file, `issues/board.json`. Desk's `docs/triage.md` owns the file's format (schema 1) and how it is refreshed; this section covers only what the fork does with it.

Turn it on in Settings > Sidebar > Board file: paste the absolute path of the file and press Save. The path is stored as `boardFilePath` in `desktop-settings.json` (default empty, so the board is off). There is no implicit Desk path. Clear empties it. Web and mobile have no such field and always show the usual sidebar.

- **Who reads the file.** The Electron main process, through the `read_board_file` command on the existing `paseo:invoke` bridge (`packages/desktop/src/features/board-file/`). The renderer never reads a path itself; it asks, and the answer names the path it was read for, so an answer for an earlier path is dropped. No protocol or daemon change.
- **When.** Right away when the sidebar is active or the path changes, then every 60 seconds while it is active. A restart is not needed after Desk's LaunchAgent rewrites the file.
- **Which file is valid.** `schema` 1 with `generatedAt` and an `issues` array whose every entry has the keys and types in `docs/triage.md`. Keys the reader does not know are ignored. A missing or unreadable file, bad JSON, another schema, a repeated Issue id or a parent cycle makes the board unavailable.
- **Unavailable means the old sidebar.** The sidebar is exactly what it was without a board: same projects, groups, pins and order. It stays that way until a later read succeeds. A board that was read earlier is not kept.
- **Matching.** A workspace belongs to Issue `DSK-N` when its name starts with `DSK-N` followed by a space or the end of the name (`DSK-36 sidebar order`). Branches, paths and names that only contain the id do not match.
- **Order.** The matched workspaces form one block above everything else, across projects, in both project and status grouping. A parent's workspaces come first and its sub-issues' follow, indented one step each, up to three steps. Siblings and top-level Issues go by ascending `sortOrder`; Issues with equal values keep the order the board file lists them in, and several workspaces of one Issue keep the sidebar's own order. The direction of `sortOrder` is checked against Linear's view by whoever accepts the change. An Issue with no visible workspace adds no row, and its matched sub-issues move up one level.
- **Row.** Each board row shows the Issue's Linear `status` and, when `run.step` is not null, that step: `In Progress · challenge`. A null `run` or a null step shows the status alone.
- **Everything else is unchanged.** The block only takes its workspaces out of the project, status and Pinned lists below it, so each shows once. Stored project order, workspace order and pins are neither read differently nor rewritten, and they apply again when the board is off. Host, project and label filters still decide which workspaces are eligible. Unmatched workspaces keep their grouping, pinning and order. A project whose every eligible workspace moved into the block gets no group below it, so no header is left with only its New workspace row; a project with one unmatched workspace left renders as before. Board rows keep their project's icon either way. The block has no collapse control and no drag.

Code: `components/sidebar/sidebar-board.ts` (matching and order, pure), `components/sidebar/use-sidebar-board.electron.ts` (path, polling; web and native resolve `use-sidebar-board.ts`, which has no board), `components/sidebar/sidebar-model.tsx` (where the block is taken out of the lists), `screens/settings/sidebar/board-file-section.tsx` (the setting).

### Expo Router

Route ownership, startup restore, and native blank-screen gotchas live in
[expo-router.md](expo-router.md). Read it before changing `packages/app/src/app`,
startup routing, remembered workspace restore, or active workspace selection.

### iOS simulator preview service

Paseo worktrees expose the native iOS dev app through the `ios-simulator` service in `paseo.json`. The service URL serves the simulator preview at `/.sim`, so the preview link is `${PASEO_URL}/.sim`.

**Prerequisites (macOS only).** The service shells out to the Apple toolchain, so beyond the `npm ci` that worktree setup runs you must install:

- **Xcode** (the full app, not just the Command Line Tools) — install it from the Mac App Store, or from `developer.apple.com/download` for a specific version. It provides `xcodebuild` and `xcrun simctl`; accept its license and let first-run component installation finish before starting the service.
- **An iOS Simulator runtime with at least one iPhone device type**. Recent Xcode versions may not bundle a runtime — add one via Xcode → Settings → Components (older Xcode: "Platforms"). The service targets `iPhone 16 Pro` by default (override with `PASEO_IOS_DEVICE_TYPE`) and falls back to any iPhone; it fails with `No iPhone simulator device type is installed` when none exist.
- **Homebrew** — CocoaPods itself installs automatically: `expo prebuild` runs `pod install` on a cold worktree, and when the CocoaPods CLI is missing the runner installs it for you. It tries `gem install cocoapods` first and falls back to Homebrew (`brew install cocoapods`), so having Homebrew available lets that fallback succeed without a manual step.

`serve-sim`, Expo, and Metro come from `npm ci`, and CocoaPods installs itself on the first prebuild as described above.

The service is designed for concurrent worktrees: it derives a deterministic simulator identity from the worktree path, uses the worktree's assigned `PASEO_PORT`, pins `serve-sim` to that simulator UDID, and only tears down that worktree's helper/simulator state. It must not rely on the globally booted simulator or any fixed Metro port.

Worktree setup best-effort seeds the generated iOS project and newest native build cache from the source checkout before the service runs. The service still validates the native project by running Expo prebuild and Xcode; the seed only avoids paying all setup/build cost from a cold worktree every time.

Starting the service must not create, focus, reveal, or leave behind macOS Simulator.app windows — a guard hides Simulator.app every 250ms, so the native window vanishes if you focus it. The user-visible surface is the interactive `/.sim` preview: a `serve-sim` stream (60 FPS MJPEG + a WebSocket control channel) that Metro mounts at `basePath: "/.sim"` (`packages/app/metro.config.cjs`) and that forwards taps and gestures, so first-launch prompts like "Open in PaseoDebug?" are answered there, not in the native window. Open the `${PASEO_URL}/.sim` link the service prints — not `serve-sim`'s raw stream port (`:3100`), which is view-only. Because the stream sits behind the daemon proxy it is convenient for remote viewing but laggy up close; for fast local dev at the Mac, use the native simulator path below.

**Troubleshooting.** If `xcrun simctl` fails with `unable to find utility "simctl"`, the active developer directory is still the Command Line Tools even though Xcode is installed. Point it at Xcode: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`, then confirm with `xcrun --find simctl`.

### Running the iOS app on a local simulator

For fast, native, interactive iOS dev at the Mac — as opposed to the remote `/.sim` preview above — skip the service and build the dev client directly:

```bash
npm run ios        # → expo run:ios (packages/app): builds and launches the app in the real Simulator.app
```

`expo run:ios` starts its own Metro and gives you the normal Simulator.app window (full speed, native touch, no stream).

**Pointing the app at a daemon.** The client resolves its local daemon from `EXPO_PUBLIC_LOCAL_DAEMON` (`packages/app/src/runtime/host-runtime.ts`); when unset it falls back to `localhost:6767`, the production `~/.paseo` daemon. To target a worktree's dev daemon instead, set it on the build command:

```bash
EXPO_PUBLIC_LOCAL_DAEMON=localhost:${PASEO_SERVICE_DAEMON_PORT} npm run ios   # worktree daemon running as a Paseo service
EXPO_PUBLIC_LOCAL_DAEMON=localhost:6768 npm run ios                          # standalone `npm run dev:server`
```

The iOS simulator shares the Mac's loopback, so `localhost:<port>` reaches the host daemon directly.

**Gotcha — `EXPO_PUBLIC_*` is inlined into the JS bundle at Metro bundle time, not read at runtime.** Set it in the same shell that starts Metro. If the app still connects to the old daemon, Metro served a cached bundle; re-bundle clean with `cd packages/app && EXPO_PUBLIC_LOCAL_DAEMON=… npx expo start -c` and reload the app.

### Desktop renderer profiling

`npm run dev:desktop` starts Electron with Chromium remote debugging enabled so
renderer CPU profiles can be captured through CDP. By default it passes
`--remote-debugging-port=0`, so Chromium atomically asks the OS for an available
port and prints the selected DevTools endpoint. Set
`PASEO_ELECTRON_REMOTE_DEBUGGING_PORT` when a QA workflow requires a validated,
fixed port.

Desktop dev also scopes Electron `userData` to the current dev root. This prevents
desktop-only environment inherited by terminals opened inside Paseo from coupling
a new worktree instance to the parent desktop instance's profile or single-instance
lock.

The desktop workspace script `exec`s the dev runner so the terminal owns the runner
PID. Terminal shutdown reaches the runner as `SIGHUP`; the runner stops Metro and
asks Electron to quit through its normal app lifecycle. Do not add an npm wrapper or
detach Electron: either change leaves an orphan holding the worktree's single-instance
lock and broken output pipes.

With desktop dev running, verify the real BrowserWindow, titlebar clearance, fullscreen
transition, and 751-pixel settings split with:

```bash
npm run verify:electron-cdp --workspace=@getpaseo/desktop
```

The verifier reads the same `EXPO_PORT` and
`PASEO_ELECTRON_REMOTE_DEBUGGING_PORT` environment names as desktop dev. Set an
explicit remote-debugging port for verifier runs, and set both when testing an
isolated instance on non-default ports.

When running a dedicated Electron QA instance against a non-default Expo port, set
`EXPO_DEV_URL` explicitly. Desktop main defaults to `http://localhost:8081`, so
`PASEO_PORT=57928` alone starts Metro on 57928 but Electron still loads 8081.

### React render profiling

The app has a gated React render profiler in
`packages/app/src/utils/render-profiler.tsx`. Wrap the component boundary you want
to measure with `RenderProfile`, then open the app with `?renderProfile=1`. When
the query param is absent, `RenderProfile` returns children directly and records
nothing.

Captured samples are exposed on `globalThis.__PASEO_RENDER_PROFILE__`. Call
`globalThis.__PASEO_RESET_RENDER_PROFILE__?.()` after warm-up and before the
interaction you want to measure. If a memo comparator or subscription boundary
needs explanation, call `recordRenderProfileReasons(id, reasons)` while profiling;
reason counts are exposed on `globalThis.__PASEO_RENDER_PROFILE_REASONS__`.

Use this workflow for any render investigation:

1. Add stable `RenderProfile` boundaries around the suspected root and expensive
   children. Keep IDs specific enough to compare before and after.
2. Reproduce against real app state, not toy fixtures, whenever practical.
3. Record an idle baseline first. If idle is noisy, fix or account for that
   before optimizing the interaction.
4. Warm up the route, reset profiler samples, run the exact interaction, then
   compare `actualDuration`, render counts, and per-commit samples.
5. When a memo boundary still renders, record reasons before changing code. Do
   not guess from object identity alone.
6. Keep changes that move the measured profile. Remove probes or memo wrappers
   that do not move the number.

What this caught during the workspace tab investigation:

- A large apparent workspace cost was real interaction work, not daemon noise;
  the idle baseline stayed near zero.
- The expensive stream rerender was mostly prop identity churn from pane context
  callbacks and capability objects, not new stream data.
- Stabilizing provider actions at the pane boundary helped because every mounted
  panel consumes that context.
- Comparing value-shaped capability flags beat preserving object identity through
  unrelated stores.
- Some plausible fixes did not pay off: memoizing the tab row and composer draft
  object barely moved the profile, so they were removed.

Existing scenario script: workspace agent/terminal tab switching. Start Expo on
web, keep a daemon available, then run:

```bash
PASEO_PROFILE_SERVER_ID=<server-id> \
PASEO_PROFILE_WORKSPACE_ID=<workspace-path> \
PASEO_PROFILE_AGENT_ID=<agent-id> \
  npm run profile:workspace-tabs --workspace=@getpaseo/app
```

This script opens the app with `?renderProfile=1`, creates a temporary terminal
tab, switches between a real agent and that terminal, prints aggregated React
Profiler timings, then removes the temporary terminal. It is an example of the
workflow above, not the only way to use the profiler. Useful knobs:

```bash
PASEO_PROFILE_APP_URL=http://localhost:19010 # Expo web URL
PASEO_PROFILE_SWITCH_COUNT=1                # number of agent/terminal switch pairs
PASEO_PROFILE_SWITCH_WAIT_MS=250            # delay after each click
PASEO_PROFILE_IDLE_WAIT_MS=3000             # idle baseline before switching
PASEO_PROFILE_DUMP_COMMITS=1                # include per-commit profiler samples
```

For warm workspace switching, point the benchmark at an app backed by seeded
daemon state:

```bash
PASEO_PROFILE_APP_URL=http://localhost:19010 \
  npm run profile:workspace-switching --workspace=@getpaseo/app
```

The benchmark first warms `Cmd+1` through `Cmd+7`, then records a rapid seven-workspace
burst. It separately warms the three-entry workspace deck LRU and records `Cmd+1` through
`Cmd+3` without waits between keys. Both scenarios report keydown-to-activation latency and
React commits on the same browser clock. Set `PASEO_PROFILE_WORKSPACE_DIGITS`,
`PASEO_PROFILE_WORKSPACE_LRU_SIZE`, or `PASEO_PROFILE_WARM_QUIET_MS` to change the shape. Set
`PASEO_PROFILE_DUMP_COMMITS=1` to include the nested component breakdown for every commit.
Set `PASEO_PROFILE_RETAINED_REPEATS=5` to repeat the retained-LRU burst for a less noisy sample.
Set `PASEO_PROFILE_CPU_PATH=/tmp/workspace-switch.cpuprofile` to run a separate retained-LRU
capture after the latency scenarios and write a raw CDP CPU profile without contaminating their
timings.
Set `PASEO_PROFILE_TRACE_PATH=/tmp/workspace-switch.trace.json` to run another separate retained-LRU
capture and write a Chromium Performance trace with User Timing marks and screenshots. Open the
trace in the Chrome DevTools Performance panel. Set `PASEO_PROFILE_TRACE_INVALIDATIONS=1` only for a
focused invalidation capture; React Native's generated stacks make that mode highly intrusive.
Set `PASEO_PROFILE_TRACE_FOCUS=1` to include focus targets, durations, and JavaScript call stacks in
the scenario report. This mode wraps `HTMLElement.focus`, so use it only for diagnosis.

For the desktop Explorer sidebar toggle, run the app against the root checkout's daemon and use:

```bash
npm run profile:explorer-toggle --workspace=@getpaseo/app
```

The harness verifies port `6768`, opens the Paseo workspace, creates and warms the Explorer pane,
records an idle control, then measures settled and 50 ms burst Cmd+E toggles. It reports
input-to-DOM and input-to-paint latency, React commits, mounts, unmounts, and DOM mutations. Set
`PASEO_PROFILE_TRACE_PATH=/tmp/explorer-toggle.trace.json` or
`PASEO_PROFILE_CPU_PATH=/tmp/explorer-toggle.cpuprofile` for separate Chromium captures. Override
the app URL, daemon port, workspace, or server with the corresponding `PASEO_PROFILE_*` variables.

For sustained composer typing, run the paired composer-versus-textarea benchmark against a seeded
daemon:

```bash
PASEO_PROFILE_APP_URL=http://localhost:19010 \
  npm run profile:composer-typing --workspace=@getpaseo/app
```

The benchmark opens the first workspace, preserves its existing draft, and dispatches 300 printable
keys at a fixed 16 ms cadence without waiting for each key to paint. It measures renderer
`keydown` to the next paint opportunity, verifies that every character survived, alternates the
composer and plain-textarea control across three runs, then restores the original draft. The report
includes percentiles, frame coalescing, input processing, React work, long tasks, slow samples, and
Playwright dispatch lateness. Set `PASEO_PROFILE_TYPING_KEYS`, `PASEO_PROFILE_TYPING_CADENCE_MS`,
`PASEO_PROFILE_TYPING_REPEATS`, or `PASEO_PROFILE_WORKSPACE_DIGIT` to change the scenario. Optional
`PASEO_PROFILE_CPU_PATH` and `PASEO_PROFILE_TRACE_PATH` captures run separately after the latency
measurements so profiling overhead does not contaminate them.

Set `PASEO_PROFILE_TYPING_SCENARIO=height-growth` to alternate `Shift+Enter` and printable input.
That report includes input and composer height changes plus React work grouped into composer,
stream, and ancestor/root scopes. Ancestor/root timings include descendant work because the Profiler
boundaries are nested. A printable key after an empty newline should not change either height.

### Preview Windows and Linux window controls on macOS

Desktop development can replace native macOS traffic lights with Paseo's custom controls:

```bash
PASEO_DESKTOP_WINDOW_CONTROLS=windows npm run dev:desktop
PASEO_DESKTOP_WINDOW_CONTROLS=linux npm run dev:desktop
```

The override is rejected in packaged builds. Restart the desktop process when changing it.

### Desktop macOS compositor watchdog

macOS display sleep can leave Chromium's GPU-process display link — the vsync
source that drives frame production — stuck on a stale display. The compositor
then stops producing frames and the window looks frozen: unresponsive to clicks
and keys even though the renderer and every process stay alive. It self-recovers
after a few minutes, which is too long for a foreground app.

`setupDarwinCompositorWatchdog`
(`packages/desktop/src/window/compositor-watchdog/index.ts`) guards against
this. It polls the renderer for frame production every couple of seconds and,
after a sustained stall while the window is visible and unlocked, restarts the
GPU process so Chromium rebuilds the display link. The probe is skipped while
the screen is locked or the window is hidden or minimized, since a window
legitimately stops producing frames then.

The watchdog deliberately leaves background throttling **enabled**. Calling
`webContents.setBackgroundThrottling(false)` would keep the compositor producing
frames non-stop, pinning ProMotion displays at 120Hz forever and draining the
battery while the app is idle — so do not re-add it. The probe's visibility
guards already prevent throttling from causing a false stall.

### Daemon logs

Check `$PASEO_HOME/daemon.log` for daemon logs. The default level is `info`; set
`PASEO_LOG_LEVEL=trace` before launching the daemon when you need full provider,
session, and agent-manager traces for stuck-state debugging.

The supervisor rotates `daemon.log`. Persisted `log.file.rotate` settings in
`$PASEO_HOME/config.json` win first. Without persisted config, the optional
`PASEO_LOG_ROTATE_SIZE` and `PASEO_LOG_ROTATE_COUNT` env vars override the
defaults. The default rotation is `10m` x `3` files everywhere.

### Git process pressure

If Git refreshes consume too much CPU, disk, or antivirus capacity, especially on Windows, reduce
the daemon-global Git process limits in `$PASEO_HOME/config.json`:

```json
{
  "daemon": {
    "git": {
      "maxProcessesPerSecond": 5,
      "maxProcessConcurrency": 4
    }
  }
}
```

Reload the daemon with `paseo reload`. Environment-variable overrides still require a restart because
the launch environment remains authoritative. Lower values reduce machine pressure but make Git-backed workspace state and
Git RPCs wait longer. See [Git process limits](data-model.md#git-process-limits) for defaults,
semantics, and environment-variable overrides.

### Agent Tool Catalog Measurement

Measure the MCP `tools/list` payload that Paseo injects into agents with:

```bash
npm run measure:agent-tools --workspace=@getpaseo/server
```

The command reports compact JSON bytes, estimated tokens, field totals, largest
tools, and the browser-tools delta. It defaults to the agent-scoped catalog; use
`-- --scope=top-level` for the unaffiliated `/mcp/agents` shape and `-- --json`
for machine-readable output.

## Worktree starting refs

A new worktree starts from the current branch's upstream, or the local branch when it has no
upstream. This keeps unpushed local commits out of new workspaces by default. The picker collapses
identical refs; divergent local or non-origin refs remain explicit, qualified choices.

The daemon sends the exact upstream ref because the remote and branch names cannot be inferred.
Worktrees retain that ref for comparisons and updates from base while exposing its branch name to
the UI. Merging into base requires a mutable local target: `origin/main` maps to local `main`, while
another remote fails closed until the worktree records an explicit local target. Older daemons omit
the optional field and retain the previous local-first behavior; older worktree metadata without the
exact ref also resolves through its stored branch name.

Worktrees inherit committed Git state only; uncommitted source-checkout changes are not copied.

## paseo.json service scripts

`worktree.setup` and `worktree.teardown` accept either a multiline shell script or an array
of commands. Both run sequentially.

Lifecycle commands run in the worktree through a stable script shell: `bash`
resolved from `PATH` on macOS/Linux, and PowerShell with `-NoProfile` on
Windows. They inherit the daemon environment plus Paseo's lifecycle variables;
login and interactive shell startup files are not loaded, and Bash's `BASH_ENV`
hook is unset. ACP single-string terminal commands use the same non-login Bash
behavior on macOS/Linux, but preserve their existing `cmd.exe /c` string semantics
on Windows. Service scripts are separate:
they launch in a terminal and receive the service environment described below.

Because the shell differs per platform, a lifecycle command that must run
everywhere cannot use POSIX-only syntax — `VAR=1 cmd` env prefixes, `$VAR`
expansion, `cp`/`rm`, or a `./scripts/*.sh` entrypoint all fail under PowerShell,
and `bash` is not guaranteed to exist on Windows. Put that logic in a Node script
that reads what it needs from `process.env` and invoke it as
`node ./scripts/<name>.mjs`. This repo's own setup does exactly that in
`scripts/seed-worktree-dev-state.mjs` and `scripts/seed-ios-native-cache.mjs`.

```json
{
  "worktree": {
    "setup": "npm ci\ncp \"$PASEO_SOURCE_CHECKOUT_PATH/.env\" .env\nnpm run db:migrate",
    "teardown": "npm run db:drop || true"
  }
}
```

Every `scripts` entry with `"type": "service"` receives these environment variables:

| Variable                    | Value                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `PASEO_SERVICE_<NAME>_URL`  | Proxied URL for a declared peer service. Prefer this for peer discovery; it survives peer restarts.                       |
| `PASEO_SERVICE_<NAME>_PORT` | Raw ephemeral port for a declared peer service. Use only as a bypass escape hatch; it can go stale if that peer restarts. |
| `PASEO_URL`                 | Self alias for `PASEO_SERVICE_<SELF>_URL`.                                                                                |
| `PASEO_PORT`                | Self alias for `PASEO_SERVICE_<SELF>_PORT`.                                                                               |
| `HOST`                      | Bind host for the service process.                                                                                        |

Service proxy hostnames use the double-dash shape: `web--feature-auth--project.localhost` or, on the default branch, `web--project.localhost`. Optional public aliases use the same leftmost label under the configured public base host.

`<NAME>` is normalized from the script name by uppercasing it, replacing each run of non-`A-Z0-9` characters with `_`, and trimming leading or trailing `_`. For example, `app-server` and `app.server` both normalize to `APP_SERVER`; that collision fails at spawn time with an actionable error.

`PORT` is not injected by default. If a framework requires `PORT`, set it in the command:

```json
{
  "scripts": {
    "web": {
      "type": "service",
      "command": "PORT=$PASEO_PORT npm run dev:web"
    }
  }
}
```

Service ports use OS ephemeral allocation by default. Set `worktrees.servicePorts` in
`$PASEO_HOME/config.json`, or replace it for one project with `worktree.servicePorts` in
`paseo.json`. The block accepts an inclusive `range` such as `"3000-4000"` or a `portScript`
executable. Since `portScript` is executed directly without a shell, it must point to a real executable (e.g., a binary or a script with a proper shebang like `#!/bin/sh`) rather than an inline shell command or shell pipeline. For inline shell commands or pipelines, wrap them in a small script. `portScript` runs in the workspace directory with four arguments: service name,
workspace ID, branch name, and worktree path. A missing branch is passed as an empty string. The same
values are available as `PASEO_SCRIPTNAME`, `PASEO_WORKSPACE_ID`, `PASEO_BRANCH_NAME`, and
`PASEO_WORKTREE_PATH`. The script must print one valid TCP port. Paseo trusts the external allocator,
so the port may already be bound. `portScript` takes precedence when both values are present.

## Bundled daemon web UI

> The user-facing guide for this feature (enabling it, reverse proxy, TLS, tunnels, security) lives at [public-docs/web-ui.md](../public-docs/web-ui.md). This section is the contributor/build reference: how the artifact is produced, bundled, and excluded from desktop packaging.

The daemon can optionally serve the browser web client from the same HTTP server. This is disabled by default.

Enable it in persistent configuration:

```bash
paseo daemon config set features.webUi.enabled true
paseo daemon start
```

Or set the environment variable:

```bash
PASEO_WEB_UI_ENABLED=true paseo daemon run
```

Or persist it in `config.json`:

```json
{
  "features": {
    "webUi": {
      "enabled": true
    }
  }
}
```

When enabled, opening the daemon HTTP origin (for example `http://localhost:6767/`) serves the web app. The same HTTP server continues to serve `/api/*`, `/mcp/*`, `/public/*`, the WebSocket upgrade, and service-proxy routes. Static files load without daemon bearer auth; API and WebSocket calls still enforce auth.

The served app auto-bootstraps a connection to the same origin, so opening `http://localhost:6767/` directly usually skips the Add Host step.

Build the artifact for packaging or measurement with:

```bash
npm run build:daemon-web-ui
```

This exports the normal browser web app (not the Electron-flavored desktop renderer) and copies it into `packages/server/dist/server/web-ui`, precompressing `.html`, `.js`, `.css`, and JSON assets as `.br` and `.gz`.

Measured bundle size for a standard Expo web export:

- raw: 10.77 MiB
- gzip: 2.55 MiB
- brotli: 1.93 MiB

The desktop-managed daemon disables the bundled web UI by default (`PASEO_WEB_UI_ENABLED=false`) because the desktop app already ships the renderer as `app-dist`. Shipping the same assets again inside `@getpaseo/server` would duplicate the ~10.8 MiB install. Desktop packaging also excludes `node_modules/@getpaseo/server/dist/server/web-ui/**` from the packaged app.

## Built workspace packages

Package imports resolve through package exports to compiled `dist/` output, not sibling `src/` files. This is true in local dev and in published packages: the app, daemon, CLI, and SDK consumers should all exercise the same runtime paths.

`npm run dev:server` builds the server-side workspace packages once, then keeps `@getpaseo/protocol` and `@getpaseo/client` fresh with TypeScript watch builds while the daemon runs. If you change protocol schemas or client code outside that watch workflow, rebuild the producer before trusting runtime behavior.

Use the named root build targets instead of remembering workspace dependency chains:

```bash
npm run build:client       # protocol -> client
npm run build:server-deps  # highlight -> relay -> protocol -> client
npm run build:server       # server-deps -> server -> cli
npm run build:app-deps     # highlight -> protocol -> client -> expo-two-way-audio
```

Use `npm run build:server` whenever you have changed any daemon/server-facing package and need clean cross-package types or runtime behavior.

The app Metro config disables Watchman and uses Metro's node crawler for exports. Keep that invariant unless you have verified production app exports on machines with and without Watchman installed; distro Watchman builds can differ in capabilities and change Metro's crawl behavior.

For tighter loops, you can rebuild a single workspace:

- Changed `packages/protocol/src/*` or `packages/client/src/*`: `npm run build:client`.
- Changed `packages/server/src/*`, `packages/cli/src/*`, `packages/relay/src/*`, or `packages/highlight/src/*`: `npm run build:server`.
- Changed app build dependencies: `npm run build:app-deps`.

## Dependency patches

`patches/*.patch` are applied by `scripts/postinstall-patches.mjs` on every install. A patch only
runs when its package is actually present, so add the package to that script's `patchedPackages`
list when you introduce a new patch — otherwise the file sits in `patches/` and never applies.
Regenerate a patch with `npx patch-package <package>` after editing `node_modules/<package>`, and
patch every build the consumers use: Metro resolves the `react-native` field of a package
(`src/*.ts` for `react-native-svg`), while Node and Vitest resolve `main`/`module`
(`lib/commonjs`, `lib/module`). Patching only `lib/` leaves the app bundle unfixed.

## ACP provider catalog versions

The in-app ACP provider catalog pins package-runner entries (`npx`, `npm exec`,
and `uvx`) to exact package versions. Run the drift checker regularly — and
before releases — so catalog installs do not sit on stale agent versions:

```bash
npm run acp:version-drift        # report stale/non-exact package pins
npm run acp:version-drift:check  # same, exits non-zero on drift
npm run acp:version-drift:update # rewrite catalog pins to latest exact versions
```

The checker updates only package-runner catalog entries. Providers that use a
preinstalled binary such as `opencode acp`, `cursor-agent acp`, or `goose acp`
are reported as skipped because their versions are owned by the user's local
install.

## CLI reference

Use `npm run cli` to run the in-repo CLI from source (`npx tsx packages/cli/src/index.ts`). The script wraps the CLI with `scripts/dev-home.sh`, so it automatically uses this checkout's `.dev/paseo-home` and dev daemon endpoint unless you pass an explicit override. The globally installed `paseo` binary on macOS is a symlink into the installed Paseo desktop app, not this checkout — use it to drive the desktop's built-in daemon, but use `npm run cli` when you want to talk to the CLI you are editing.

Canonical automation uses `paseo project create/ls/rename/delete`, `paseo workspace create/ls/rename/archive`, `paseo heartbeat create/update/delete`, and the full `paseo schedule` group. MCP heartbeat automation is intentionally smaller: create and delete only. Detach remains an explicit user lifecycle action rather than an agent tool. `paseo run --new-workspace local|worktree` composes workspace creation with agent creation. The old `paseo worktree` and `paseo run --worktree` forms are hidden compatibility aliases.

```bash
npm run cli -- ls -a -g              # List all agents globally
npm run cli -- ls -a -g --json       # Same, as JSON
npm run cli -- inspect <id>          # Show detailed agent info
npm run cli -- logs <id>             # View agent timeline
npm run cli -- agent open <id>       # Focus an existing agent in Paseo Desktop
npm run cli -- daemon status         # Check daemon status
npm run cli -- clone owner/repo --dir ~/workspace # Clone GitHub repo and register project
```

Use the global `--host` option to point the CLI at a different daemon:

```bash
npm run cli -- --host localhost:7777 ls -a
npm run cli -- --host ssh://user@host ls -a
```

Set `PASEO_HOST` to use the same target across invocations. An explicit
selector overrides both environment selectors. With both `PASEO_HOME` and `PASEO_HOST` set, pass an explicit selector. See [CLI target selection](../public-docs/cli.md#select-one-daemon).

In an SSH URI, the URL port is the SSH server port. The remote daemon defaults to `127.0.0.1:6767`; use `?daemonPort=7777` to override it. The transport runs non-interactively through the local OpenSSH client and never installs, starts, or configures the remote daemon. User-facing setup and troubleshooting live in [public-docs/connectivity.md](../public-docs/connectivity.md#ssh).

Desktop integrations can focus an existing agent without creating one or
sending a message. Use `paseo://h/<server-id>/agent/<agent-id>`, or run
`paseo agent open <agent-id>`. The CLI reads the local daemon's server ID by
default; pass `--server <server-id>` when targeting another server.

## Agent state

Agent data lives at:

```
$PASEO_HOME/agents/{cwd-with-dashes}/{agent-id}.json
```

Find an agent by ID:

```bash
find $PASEO_HOME/agents -name "{agent-id}.json"
```

Find by content:

```bash
rg -l "some title text" $PASEO_HOME/agents/
```

## Provider session files

Get the session ID from the agent JSON (`persistence.sessionId`), then:

**Claude:**

```
~/.claude/projects/{cwd-with-dashes}/{session-id}.jsonl
```

**Codex:**

```
~/.codex/sessions/{YYYY}/{MM}/{DD}/rollout-{timestamp}-{session-id}.jsonl
```

## Testing with Playwright MCP

Point Playwright MCP at the running Expo web target. For root checkout dev, `npm run dev:app` reserves `http://localhost:8081`. For Paseo-managed worktree app services, use the service URL or port shown by Paseo for that worktree.

Do NOT use browser history (back/forward). Always navigate by clicking UI elements or using `browser_navigate` with the full URL — the app uses client-side routing and browser history breaks state.

## App web deploys

`packages/app` exports a single-page Expo web app and deploys the `dist/`
directory to Cloudflare Pages with `npm run deploy:web --workspace=@getpaseo/app`.

PWA install metadata lives in `packages/app/public/manifest.json` and is linked
from `packages/app/public/index.html`. Keep the install icons in `public/` so
Cloudflare serves them from stable root URLs after `expo export`.

Do not add service-worker caching casually. Paseo is a live control surface for
agents, and an aggressive service worker can strand installed users on stale web
code. If offline behavior becomes a product requirement, add it deliberately
with an update strategy and test the installed-app upgrade path.

## Expo troubleshooting

```bash
npx expo-doctor
```

Diagnoses version mismatches and native module issues.

## Typecheck

Always run typecheck after changes:

```bash
npm run typecheck
```
