# Three-zone landscape surface (v9)

## UI

- Player portrait, name, faction and initiative live inside the header; no extra identity row consumes game height. Long names retain accessible titles.
- Landscape >=800 CSS px uses three independent zones: left initiative/Holo order, center actions+timer, right strategy overview. Narrow tall wheel stages use a vertical queue with full-width name labels. All-player roster stays bounded to the left zone so it never covers Undo/actions.
- Header remains compact; portrait and narrower screens retain usable stacking. Explicit bounded list scrolling and 44px touch targets remain in place. Previous gray/struck-through card states and framed wake button are preserved.
- All seated players can open Admin; the scoped server-side permission and negative-token tests are documented in DEVELOPMENT-shared-prototype-admin.md. Host role, unrelated host-only endpoints and own-active-player Undo rules are retained.

## Evidence

- New assertions run against old v7 produced actual RED: 249 cases before an asset-load abort, 190 layout/structure failures (missing zones and identity outside header). Saved as output/three-zone-red.json.
- Candidate v8: 150 auth checks passed; 302 UI cases completed with 2 failures, both roster covering the Undo edge at800x360. Popup was then confined to its own left column.
- Final v9: **302 cases, zero layout, runtime or network failures**; output/candidate-v9-verification.json. Includes3/8player fixtures, setup/draft/actions/Politics/secondaries/status/next-round, tools and a real nonhost Admin faction mutation with server readback. Covers915x412/360/320,800x360,2400x1080,1440x900 and portrait rotation.
- New checks prove zone ordering and content placement, identity fully contained in header, settled wheel-label bounds, card-state styles, visible wake button and all existing reachability/ancestor clipping/hit tests. Every roster row is scrolled and hit-tested.
- Loopback is a secure origin unlike the actual HTTP LAN IP. The LAN layout context explicitly blocks service workers, avoiding accidentally exercising PWA caching/activation; PWA behavior is not covered by this suite. The earlier intermittent .NET asset abort is not claimed fixed.
- Legacy Chromium:25layouts, zero errors, now verifies nonhost Admin visibility and current-player controls. Shared-admin API suite:150 checks. Table-flow/parallel-Undo and fake-clock/real-CSS resize regressions all passed.
- Actual3player action and8player primary screenshots reviewed. Left names are readable; central primary action/timer and all8 strategy rows remain visible.

## Live deployment

- Revision4111366-pixel-landscape-v9; image sha256:d3158de7dc2d5f89526fca6f65077407f78d3e36c854ed6efe30bd934e39cbba.
- Backup: /data/docker/compose/ti4-boardgame-helper/backups/before-pixel-ui-20261107T181458Z/ti4-data.tar.gz. Entire compressed archive read-validated before application replacement; old config/image rollback retained.
- Existing FS5EQ state fully unchanged; same3 players, same persistent volume. Gateway unchanged. Read-only live smoke at915x412 produced no page errors and identical game state before/after. Live CSS and vertical-wheel module read back and verified; non-LAN and spoofed-LAN sources stillHTTP403.
