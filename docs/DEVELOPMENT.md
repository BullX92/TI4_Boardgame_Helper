# TI4 Table Companion

A mobile-first table companion built on ArcticArt/ti4companion. The interface is in English and uses the local TI4-Agent artwork, colors and starfield. The strategy-card overview follows the supplied physical turn tracker: colored, angled rows, large initiative numbers and clear owner/played states, without rule text.

## Run

```powershell
.\Start-Prototype.ps1
```

Open **http://localhost:5116/table** to create a real session, or **http://localhost:5116/prototype.html** for three simulated phones. `Set up demo table` starts before faction selection; `Start new demo table` jumps into the action phase with two strategy cards per player.

The script uses the project-local .NET 10 SDK in `.dotnet`, with a fallback to an installed `dotnet`. The backend binds to localhost. Real phones need a reachable LAN/HTTPS endpoint; scanning a localhost invitation on another device will not reach this PC.

## Player guide

1. **Create:** select 3–8 players, enter a unique name for each and press **Create session**. The invitation link and QR code are generated. Share the same invitation with everyone.
2. **Choose your seat:** each player, including the creator, selects their name from the prepared list. An occupied seat cannot be taken by another device. The creator keeps the host role when choosing a different name.
3. **Faction and ready:** choose an unused faction and press **I am ready**. The host can arrange seats clockwise and select the starting Speaker. When everyone is ready, press **Start strategy phase**.
4. **Pick strategy cards:** the Speaker picks first, then players pick clockwise. With **3 or 4 players, everyone picks twice**; with 5–8, everyone picks once. The right-hand overview shows the owners. The host can press **Start game** only when the draft is complete.
5. **Take turns:** the lowest initiative starts; Naalu uses initiative 0. The active player sees **End turn**, **Pass** and **Play SC**. The timer shows the current turn's elapsed time only. There is no limit or penalty. Passing is available after using all owned strategy cards.
6. **Strategy action:** play an unused card. All other players immediately see **Follow / Skip**, including players who passed. Their answers and secondary completion are independent of the primary. Follow is saved immediately and survives reload. The owner confirms **Primary complete** separately; the turn can end once both primary and all secondaries are complete. Politics still requires choosing the new Speaker before confirming the primary. The overview marks played cards on every device.
7. **Undo:** the active player can use the curved-arrow button beside the timer to undo their last own action in the current turn, after confirmation. It does not rewind another player or overwrite a saved Follow / Skip decision. If another player has changed a field needed by the rollback, Undo is disabled. Completing the primary can still be undone while retaining completed secondary answers.
8. **Round end:** passed players are skipped but can still follow secondaries. Once everyone has passed, the host starts the guided status phase. Objectives, payments, combat and any agenda phase are resolved at the physical table.

## Display and synchronization

All player views stay dark. The active player is highlighted with a blue panel, brighter blue outline and gold turn label. Initiative order, SC ownership and played states update through the existing SignalR backend. Each of the three demo phones has an independent identity.

The app requests a Screen Wake Lock where supported, while the page is visible and the context is secure. If it is unavailable or denied, the footer offers a retry button. This keeps supported screens from sleeping; it does **not** set the OS brightness or unlock a locked phone. Source: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API

## Implementation and source

- Code: repository root, branch `main`. In the original local workspace the checkout is in `upstream/`.
- Original base: `120b0d527ade6f606e402aafa63e92ed0896ae84` from https://github.com/ArcticArt/ti4companion.
- The existing server owns sessions, seats, factions, initiative, strategy picking, turn flow, persistence and broadcasts. There is no second game engine.
- Named rosters are created atomically through the existing create-session endpoint. Device assignment and readiness persist in SQLite. Concurrent mutations are serialized per session; duplicate seat/card picks are rejected rather than displacing another player.
- Prototype rules are scoped to sessions named `Table Prototype`. These sessions always use the normal card count, including saves from the earlier one-card demo.
- Main view: `Ti4Companion.Web/Pages/TablePrototype.razor`. The right-hand board is `PrototypeStrategyBoard`; creation, setup and screen-attention behavior are separate small components.
- TI4-Agent source: `C:\00_GIT_Repos\00_TI4_Agent\TI4_AI_Assisstend_Copilot\frontend\public`. The copied assets and checksum manifest are under `wwwroot/assets/ti4-agent`. There are 31 faction portraits and one fallback.
- `prototype.patch` was an early local snapshot. The maintained release is the repository source, including the Docker and OMV configuration.
- Original MIT license and third-party artwork notices remain in the repository root.

## Verification — 31 October 2026

Build succeeds. Run the repeatable local HTTP checks with the server running:

```powershell
python scripts\verify_table_flow.py
```

The script creates disposable sessions and never prints device tokens. Results are saved to `artifacts/named-session-checks.json`.

Verified:

- Fixed rosters and creator choosing another seat while retaining host control.
- Simultaneous claims for one seat: one success, one conflict.
- 3- and 4-player sessions: two cards each, including an old saved one-card setting.
- Simultaneous and duplicate card picks cannot steal or duplicate a card.
- Ready/faction gates and a complete draft before game start.
- Naalu first with initiative 0.
- Complete 3- and 4-player action phases: respectively 6 and 8 strategy cards played; secondaries stay clockwise, including passed players; everyone eventually passes.
- Informational timer configuration with no time limit.
- Browser walkthrough: named creation, name selection on three devices, faction selection, readiness, two rounds of SC picks, game start, SC played state on other devices, and synchronized active-turn highlighting.
- Three narrow iframe views: 370-pixel content width without horizontal overflow. Timer, three action buttons, initiative list and SC overview are visible together.

Security update (2026-11-05): Microsoft ASP.NET Core, Blazor, SignalR and EF Core packages now use 10.0.14. Obsolete OpenAPI and native SQLite version overrides were removed because the updated dependencies supply newer versions. Build: 0 warnings and 0 errors. NuGet vulnerability checks including transitive dependencies found no known vulnerable packages in either ApiService or Web. The local ASP.NET Core runtime is 10.0.14. Three-device browser loading and the 3-/4-player action-phase checks passed after the update. A real iPhone/Android test is still pending; screen-lock and power-saving behavior has not been physically verified.


## Host controls

The host can open **Admin** from the expandable **TOOLS** rail on the left to manage setup and act for a player whose device is unavailable. During setup the host may add or remove non-host players, choose factions and mark players ready, including players without a connected device. During strategy and action phases the panel offers the current player’s applicable choices, including strategy picks, strategy actions, secondary responses, passing and advancing the turn. Player additions and removals are limited to setup. **Player times** is available in the same left rail. One panel opens at a time; closing the panel returns to the options, and closing the rail returns to the game.

## Compact smartphone layout — 5 November 2026

The supplied TI4-Agent screenshot remains the visual basis: dark starfield, blue active-turn console, faction artwork, gold initiative and eight angled strategy-card rows. The session toolbar now combines round, phase, invitation code, connection state, player times and Admin. The player identity and timer use much less vertical space.

In landscape viewports up to 500px high, turn controls and initiative stay on the left and all eight cards stay on the right. Larger rosters use a two-column initiative list, ordered across each row. When only one unplayed strategy card remains, its play button sits alongside End turn and Pass. Primary action buttons and toolbar controls retain a minimum height of 44 CSS pixels. Naalu's initiative 0 appears in the board heading instead of adding a ninth row. Long player names have ellipsis and a full-name title. Portrait phones stack the strategy board below the controls. Safe-area insets are reserved at the screen edges.

Verification: Web build succeeded with 0 warnings/errors. Chromium and WebKit each passed 19 layout cases covering 3, 6 and 8 players, five landscape sizes from 640×360 to 844×390, portrait 390×844, and desktop 1440×900. In the tested normal action states, the turn controls, entire initiative list and all eight strategy cards fit within the landscape viewport; no horizontal overflow occurred. Longer primary/secondary workflows and the footer can still scroll. Admin and player-time panels, primary/secondary resolution, played-card updates and synchronized turn handoff passed. The existing 3-/4-player API flow checks also passed. Physical Android/iPhone checks remain pending.

A browser check also found that the wake-lock module was rewritten to a fingerprint URL that the hosted static-file server did not serve. `StaticWebAssetsFingerprintContent=false` extends the existing stable-file configuration to application modules. The module now loads successfully; the Chromium test browser reports the screen is kept awake.

To repeat the UI checks with a running server and Playwright CLI:

```powershell
playwright-cli -s=compact open http://localhost:5116/prototype.html
playwright-cli -s=compact --raw run-code --filename scripts/verify_compact_ui.js
playwright-cli -s=compact-webkit open http://localhost:5116/prototype.html --browser webkit
playwright-cli -s=compact-webkit --raw run-code --filename scripts/verify_compact_ui.js
```

The check creates disposable sessions and saves screenshots under `output/playwright/`. Device tokens stay in memory and browser storage. Reports from this run: `output/playwright/compact-ui-checks.json` and `output/playwright/webkit-compact-ui-checks.json`.

## Live Holo-Rad — 6 November 2026

The actual `/table` view now uses `PrototypeInitiativeWheel` for initiative order, following the selected Holo-Rad preview. Fixed settings: depth 1.3, turn transition 1800ms, hologram glow 0.35, and 80% original faction colors with a 20% hologram tint. The active faction is largest, followed by the next two eligible players at decreasing depth. Centers are closer together than in the preview. The entire component uses 114px in short landscape viewports (96px projection stage plus its heading), with a larger presentation in portrait and on desktop.

The existing server supplies the active player and all ranks. `prototype-initiative-wheel.js` only animates the presentation; it never advances turns or sends game actions. Passed players are excluded from the projected queue, Naalu retains initiative 0, and the queue wraps in initiative order. The full roster and passed states remain accessible through the player-count disclosure. One remaining player appears once; all passed shows a round-complete state. Secondary resolution and repeated state refreshes do not replay the transition. Quick successive turns settle on the newest server focus. Reduced-motion preferences disable the visual transitions.

Validation: Web and hosted API builds succeed without warnings/errors. Chromium and WebKit each passed 19 viewport/roster cases (3, 6 and 8 players; landscape down to 640×360, portrait and desktop), plus synchronized turn animations on two browser devices, primary/secondary stability, passing, rapid handoff, a single remaining player and the all-passed state. The existing 3-/4-player API flow checks still pass. Physical iPhone/Android testing remains pending.

Repeat with `scripts/verify_compact_ui.js` using the Playwright commands above. Current reports: `output/playwright/chromium-wheel-checks.json` and `output/playwright/webkit-wheel-checks.json`.

## Left tools rail — 6 November 2026

Player times and Admin now share the collapsible vertical TOOLS tab at the left screen edge. Its 44px touch target has a reserved gutter and does not cover game actions. Expanding the tab reveals the options; choosing one displays its scrollable content alongside the navigation. The previous independent fixed-position drawers and header buttons have been removed. Admin remains host-only; every player can see player times.

The rail uses a native modal dialog for background inertness and Escape dismissal. Close panel returns to the options; Close tools, tapping the backdrop, or Escape collapses the rail. Focus returns to the trigger explicitly, including WebKit/Safari where mouse clicks do not focus buttons automatically. The active player-time timer is disposed when its panel closes. Insets and the viewport height are respected, and the background is scroll-locked while the rail is open.

Verification covers narrow landscape and portrait panels, Admin turn handoff while the rail stays open, player-time values, hidden Admin access for non-hosts, panel dismissal, focus restoration, and all existing compact-layout / Holo-Rad checks. Reports: `output/playwright/chromium-rail-checks.json` and `output/playwright/webkit-rail-checks.json`.

## Parallel SC actions, own Undo and 2400x1080 — 6 November 2026

Primary and secondaries now use their existing independent server fields. Playing an SC immediately opens the secondary for every other player, with notifications through the existing push path when configured. Players answer in parallel, including passed players. Follow is persisted as an action-specific log event, while Secondary complete / Skip clears that player's pending state. Closing the last secondary leaves an unfinished primary intact; finishing the primary leaves pending secondaries intact. Turn advance remains blocked until both are complete. Technology entry, if enabled, waits for both lanes to finish. Admin can complete the primary and handle each pending secondary independently.

The active player's Undo button requires a native confirmation and is also guarded server-side. Checkpoints contain only the tracked action fields and their original log-event IDs, stored atomically in the existing session log. Internal checkpoints are excluded from the public log. Undo is restricted to the current player's own current turn; it applies a field-level inverse only when affected fields still match that action's result. Other participants' responses and saved Follow decisions are preserved. Concurrent confirmations can apply a checkpoint only once. An SC action ID rejects delayed primary/secondary answers after a card was undone and replayed. No database schema migration is required.

The wide landscape layout now fills a 2400x1080 viewport instead of stopping at 1200px. Card typography, controls and the Holo-Rad scale for that display. The compact phone layout remains available at 800x360 and down to 640x360 CSS pixels; a phone with a 2400x1080 physical panel may report these smaller CSS dimensions because of its device-pixel ratio.

Checks: `python scripts/verify_parallel_undo.py` and `python scripts/verify_table_flow.py` cover both completion orders, concurrent answers, Politics, protected Follow decisions, Undo permissions/confirmation/stale requests and full 3-/4-player rounds. The UI flow now covers three browser devices, native Undo cancel/accept, preserved secondary answers, the left rail and Holo-Rad, and 25 viewport/roster cases per browser. Reports: `output/playwright/chromium-parallel-undo-checks.json`, `output/playwright/webkit-parallel-undo-checks.json`, and `artifacts/parallel-undo-checks.json`.

For the flow with native confirmations, run the same browser checks directly through the installed Playwright package. The CLI run-code integration returns early on a native dialog, so it cannot reliably await this whole test:

```powershell
node scripts/run_ui_checks.cjs '<installed playwright package path>' chromium
node scripts/run_ui_checks.cjs '<installed playwright package path>' webkit
```
