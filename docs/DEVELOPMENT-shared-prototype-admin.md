# Shared Prototype admin permission

All registered players of a `Table Prototype` session may operate its admin panel. `CallerCanUsePrototypeAdmin` resolves the request's existing device token against that session's players. It does not modify `IsHost`, token ownership, or the global host/self helpers. Other session types retain their permissions.

## Traced UI/API contract

`PrototypeAdminPanel.razor` calls:

| UI action | Endpoint / request |
|---|---|
| Faction / readiness for another player | `PATCH /players/{playerId}`, `UpdatePlayerRequest` (FactionId, IsReady only) |
| Add setup player | `POST /players`, `JoinSessionRequest` with Unclaimed=true |
| Remove setup player | `DELETE /players/{playerId}` |
| Pick for current picker | `POST /players/{playerId}/strategy-cards`, AssignStrategyCardRequest |
| End active turn | `POST /turn/advance` |
| Pass active player | `POST /players/{playerId}/pass`, SetPassedRequest |
| Play active player's strategy | `POST /active-strategy`, SetActiveStrategyCardRequest |
| Complete primary | `POST /primary/complete`, CompletePrimaryRequest (card and ActionId) |
| Confirm secondary answer | `POST /players/{playerId}/secondary-done`, CompleteSecondaryRequest (ActionId) |
| Complete scoring | `POST /players/{playerId}/status-done`, SetStatusDoneRequest |

The nested `PrototypeSpeakerPicker.razor` uses `POST /speaker`, SetSpeakerRequest. Shared callers can choose the starting speaker during setup or appoint the speaker for running Politics; the current speaker remains an invalid target.

Only faction/readiness fields gain cross-player profile access, not name/color/seat-order or generic HasPassed edits. Setup add/remove restrictions, host-removal prohibition, faction uniqueness, current draft picker, active-player pass, unused-card ownership, unfinished-action blocks, stale strategy action IDs, and own-active-player undo stay enforced. Prototype scoring completion is additionally checked against Status/Scoring and the current scorer. Session PATCH/DELETE, turn jumping, phase transitions and unrelated endpoints remain unchanged.

## Integration verification

`verify_shared_admin.py` is standalone stdlib Python and refuses every base URL except loopback port 18094. It permits API access only to IDs/join codes returned by fixtures created during its own run. It claims a nonhost seat and uses that token for the entire panel action sequence, including host and third-player targets. It checks missing/random/cross-session credentials, unchanged host flags and caller identity, setup constraints, draft order, stale actions, Politics, action completion, passing, scoring order and host-only settings/deletion/turn jumping.

Run on the isolated candidate host:

```
TI4_BASE_URL=http://127.0.0.1:18094 python3 scripts/verify_shared_admin.py
```

The test intentionally leaves disposable fixtures for diagnosis; it never accesses pre-existing tables or production. Old v7 reproduced RED on the first cross-player faction/readiness PATCH: expected 200, received 403 `Not allowed — host only.`

Final candidate v9 passed all **150 integration checks**, including outsiders and cross-session credentials, actual shared mutations and preserved host identity. The browser suite additionally performed a real nonhost-to-host faction edit through the Admin UI and verified server readback. Legacy Chromium also opened the nonhost panel and verified the current-player action. Built/deployed revision: `4111366-pixel-landscape-v9`; game-state backup and full FS5EQ comparison were successful. No live game actions were performed for these tests.
