# TI4 Boardgame Helper on Sites

The compact table at `/table` uses the original Blazor views with a Workers API. The Sites build supports setup and QR invites, seat claiming, the strategy draft, turn order, primary/secondary flows, undo, shared admin controls, player times and status/round progression. Agenda resolution in the compact table is performed at the physical table as before.

Sites gates page access. Each device owns its seat via a device token bound to the signed-in Sites identity. A join code locates the table and can claim a free seat. As in the existing compact UI, any seated player can help through shared Admin controls, while game phase changes, starting seat order and deletion require the host. An owner-private Site requires a separate access grant for players with other accounts.

D1 stores each table and its latest 2,500 timeline events together. A revision check prevents concurrent mutations from overwriting each other. Visible player views fetch changes about once per second with conditional requests and reconnect automatically. The Docker build continues to use SignalR and its existing SQLite databases. Sites has separate game data. The legacy companion and wall screens, web push and import of existing OMV saves are outside the Sites build.

## Build and verify

With .NET 10 SDK, Python 3 and Node 24, run `npm ci`, `npm run build`, then `npm test`. The test runs the bundled Worker against a temporary SQLite database through the D1 statement interface. It covers permissions, simultaneous seat claims and actions, the round flow and reopening a persisted game.

Sites needs a Worker deployment with the entrypoint `dist/server/index.js`, assets in `dist/client`, and a D1 binding named `DB`. Provision the binding in the Site hosting manifest and apply the SQL migration in `drizzle/`.
