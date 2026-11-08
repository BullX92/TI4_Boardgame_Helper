# Card states and wake-button visuals

## Behavior

- Existing `.available` (unpicked) and `.played` rows share grayscale(1), opacity .68 and a struck-through card title. Picked/unplayed cards retain full color. Ownership, `data-played` and game logic are unchanged.
- The wake control remains an explicit `type="button"` invoking the existing wake-lock request. It now has a solid background, visible border, 44px minimum height, focus ring and green confirmed-awake state.
- Existing browser restrictions remain: native screen wake-lock requires a secure context. Styling does not bypass the HTTP LAN browser restriction.

## Verification

- `verify_card_wake_visuals.cjs`: real Chromium style regression, RED on previous styles and GREEN after the changes.
- `verify_pixel_landscape.cjs`: asserts actual rendered card state styling and visible wake-button semantics/border/background, in addition to its existing viewport, clipping, hit-testing and touch-target checks. Complete v7 run: 296 cases, zero layout/runtime/network failures; `output/candidate-v7-verification.json`.
- Legacy Chromium runner: 25 layouts, zero errors, including multi-device transitions, secondary actions, Undo and tools.
- Actual Pixel-landscape screenshot manually reviewed: cards 7/8 gray and crossed, 1–6 colored, wake button visibly framed, no new clipping.

## Deployment verification

- Live revision `4111366-pixel-landscape-v7`, image `sha256:9139547fa68c9495b74755a57cfde2119a656f891783d82888a6227ec7463f01`.
- Whole-volume backup before application replacement: `/data/docker/compose/ti4-boardgame-helper/backups/before-pixel-ui-20261107T152035Z/ti4-data.tar.gz`; full archive read validation succeeded.
- Session FS5EQ and its three players fully unchanged after replacement; gateway ID unchanged and same persistent volume retained.
- Read-only live browser smoke: document and viewport both 915×412 at DPR2.625, zero page errors, session unchanged. Live compiled CSS read back and both new visual rules verified. Non-LAN access remains HTTP403.
