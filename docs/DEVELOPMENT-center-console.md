# Compact center-sector header and persistent Tools wake switch

## UI

- Strategy/action views place the only header inside `turn-main`, above the timer/actions. There is no full-width top row reducing the height available to initiative order and strategy overview.
- New `PrototypeTableHeader` groups faction portrait, player name, short faction label (`barony`→Letnev) and a small inline `Initiative N`. Round/phase are clearly separated from the less prominent room code and Live status. Full names retain title text; narrow/portrait layouts remain supported.
- Setup/status/new/join views reuse the same compact header as their fallback, since they do not have a three-zone action surface. Game logic and the supplied space backdrop are unchanged.
- The screen-awake switch lives in the left Tools nav, with explicit On/Off and real acquired-lock `aria-checked`. Home navigation moved into Tools to retain the previous header link.
- The native dialog's nav is rendered persistently even while closed. Opening/closing Tools or Admin must not unmount the wake component, release a held lock or reset an explicit Off selection.

## Wake Lock behavior

Existing automatic acquire attempts on connect remain. Explicit Off releases the lock and disables visibility reacquisition; On retries. Generation/lock identity guards handle pending requests, disconnect/reconnect and stale release events. Active-player title signaling remains.

On the actual HTTP LAN-IP origin, Wake Lock is not available: the disabled switch states that HTTPS and a supported browser are required. No insecure-context bypass, HTTPS deployment or background media workaround was added. Browser API mocks in tests do not prove hardware screen-wake behavior.

## Verification

- Real center-header browser RED against the prior backdrop build: `Header must exist only inside the central sector`.
- Wake unit RED against old module:2/9 passed. GREEN:9/9, including late acquisition, explicit Off and reconnect/release races.
- Real browser fixture GREEN across915x412,915x320,800x360 and412x915: header inside middle zone, one header,57.5px header height,10px initiative, Bb/Letnev/Initiative3 grouping and no wake control in header.
- Mocked Wake Lock acquired before opening Tools; On→Off, close/reopen retaining Off, On again, Admin open/close and Tools close retained one held lock with exactly2requests/1release. Unsupported browser fixture made0requests and exposed disabled switch plus HTTPS hint. These tests only mutate their newly created loopback18094 sessions.
- Full Pixel suite:302 completed cases, zero layout/runtime/network failures, with additional center-header and wake-location assertions. Legacy Chromium:25 layouts and existing flow/Undo/focus/animation interactions, zero errors. Background suite:10cases and exact supplied-image hash unchanged. Card-state/wake-button style checks passed.
- Actual waiting-player and open-Tools screenshots reviewed. Existing English UI, gray/struck-through unused/played cards, and Holo order retained.
