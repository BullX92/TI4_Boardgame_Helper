import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import worker from "../dist/server/index.js";

const host = { account: "host", token: "a".repeat(32) };
const guest = { account: "guest", token: "b".repeat(32) };
const third = { account: "third", token: "c".repeat(32) };
const spectator = { account: "spectator", token: "d".repeat(32) };
const dir = mkdtempSync(join(tmpdir(), "ti4-worker-test-"));
const databasePath = join(dir, "tables.db");

function d1(database) {
    return {
        prepare(sql) {
            const statement = database.prepare(sql);
            function bound(args) {
                return {
                    first: async () => statement.get(...args) ?? null,
                    run: async () => ({ meta: statement.run(...args) }),
                    bind: (...next) => bound(next),
                };
            }
            return bound([]);
        },
    };
}

test("real table lifecycle with durable saves, seat races and parallel secondaries", async t => {
    let database = new DatabaseSync(databasePath);
    t.after(() => { database.close(); rmSync(dir, { recursive: true, force: true }); });
    database.exec(readFileSync("drizzle/0000_ti4_tables.sql", "utf8"));

    const call = (path, device, method = "GET", body, headers = {}) => worker.fetch(
        new Request("https://ti4.test" + path, {
            method,
            headers: {
                ...(device ? { "oai-authenticated-user-id": device.account, "X-Device-Token": device.token } : {}),
                ...(body === undefined ? {} : { "Content-Type": "application/json" }),
                ...headers,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        }), { DB: d1(database) },
    );
    async function ok(pending) {
        const response = await pending;
        assert.equal(response.status, 200, response.ok ? undefined : await response.clone().text());
        return response.json();
    }

    assert.equal((await call("/health", null)).status, 200);
    assert.equal((await call("/api/content", null)).status, 401);
    const html = await call("/table", host);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /_framework\/blazor\.webassembly/);

    const created = await ok(call("/api/sessions", host, "POST", { playerNames: ["Sol", "Hacan", "Sardakk"] }));
    let game = created.session;
    const base = "/api/sessions/" + game.id;
    const byCode = "/api/sessions/" + game.joinCode;
    const [a, b, c] = game.players.map(p => p.id);
    assert.equal(game.callerPlayerId, a);
    const poll = await call(byCode, guest);
    assert.equal((await poll.clone().json()).callerPlayerId, null);
    const tag = poll.headers.get("ETag");
    assert.equal((await call(byCode, guest, "GET", undefined, { "If-None-Match": tag })).status, 304);

    const claims = await Promise.all([guest, spectator].map(device => call(base + "/players", device, "POST", { claimPlayerId: b })));
    assert.deepEqual(claims.map(r => r.status).sort(), [200, 409]);
    const bDevice = claims[0].ok ? guest : spectator;
    const visitor = claims[0].ok ? spectator : guest;
    await ok(call(base + "/players", third, "POST", { claimPlayerId: c }));
    assert.equal((await call(base + "/players", visitor, "POST", { claimPlayerId: a })).status, 409);
    assert.equal((await call(base + "/phase/start", bDevice, "POST")).status, 403);
    assert.equal((await call(base + "/phase/start", { account: visitor.account, token: host.token }, "POST")).status, 403);
    assert.equal((await call(base + "/players/" + a, visitor, "PATCH", { isReady: true })).status, 403);

    const reloaded = await call(byCode, bDevice, "GET", undefined, { "If-None-Match": tag });
    assert.equal(reloaded.status, 200);
    game = await reloaded.json();
    assert.equal(game.callerPlayerId, b);
    assert.equal(game.players[1].seatClaimed, true);
    assert.ok(!JSON.stringify(game).includes("deviceKey"));

    const players = [[a, host, "sol"], [b, bDevice, "hacan"], [c, third, "sardakk"]];
    for (const [id, device, factionId] of players) await ok(call(base + "/players/" + id, device, "PATCH", { factionId, isReady: true }));
    await ok(call(base + "/phase/start", host, "POST"));
    for (let card = 1; card <= 6; card++) {
        const [id, device] = players[(card - 1) % players.length];
        await ok(call(base + "/players/" + id + "/strategy-cards", device, "POST", { strategyCardId: card }));
    }
    game = await ok(call(base + "/phase/action", host, "POST"));
    assert.equal(game.activePlayerId, a);

    const action = (device, path, body) => call(base + "/" + path, device, "POST", body);
    game = await ok(action(host, "active-strategy", { strategyCardId: 1 }));
    const undone = await ok(action(host, "undo", { actionId: game.undoActionId, confirmed: true }));
    assert.equal(undone.activeStrategyCardId, null);
    assert.equal(undone.players[0].strategyCards[0].isExhausted, false);
    game = await ok(action(host, "active-strategy", { strategyCardId: 1 }));
    assert.equal(game.players.filter(p => p.secondaryPending).length, 2);
    const actionId = game.strategyActionId;
    await ok(action(bDevice, "players/" + b + "/secondary-follow", { actionId }));
    assert.equal((await action(host, "undo", { actionId: game.undoActionId, confirmed: true })).status, 409);
    await Promise.all([bDevice, third].map((device, index) => ok(action(
        device, "players/" + [b, c][index] + "/secondary-done", { actionId },
    ))));
    game = await ok(action(host, "primary/complete", { actionId, strategyCardId: 1 }));
    assert.equal(game.players.some(p => p.secondaryPending), false);
    const advance = { expectedRevision: game.workerRevision, expectedPlayerId: a };
    const advances = await Promise.all([action(host, "turn/advance", advance), action(bDevice, "turn/advance", advance)]);
    assert.deepEqual(advances.map(r => r.status).sort(), [200, 409]);

    for (const [id, device, card] of [[b, bDevice, 2], [c, third, 3], [a, host, 4], [b, bDevice, 5], [c, third, 6]]) {
        game = await ok(action(device, "active-strategy", { strategyCardId: card }));
        assert.equal(game.activePlayerId, id);
        if (card === 3) {
            assert.equal((await action(device, "primary/complete", { actionId: game.strategyActionId, strategyCardId: card })).status, 400);
            await ok(action(device, "speaker", { playerId: c }));
        }
        const idForCard = game.strategyActionId;
        for (const [otherId, other] of players) {
            if (otherId !== id) await ok(action(other, "players/" + otherId + "/secondary-done", { actionId: idForCard }));
        }
        game = await ok(action(device, "primary/complete", { actionId: idForCard, strategyCardId: card }));
        if (card < 4) await ok(action(device, "turn/advance", { expectedRevision: game.workerRevision, expectedPlayerId: id }));
        else await ok(action(device, "players/" + id + "/pass", { passed: true }));
    }
    await ok(action(host, "phase/status"));
    for (const [id, device] of players) await ok(action(device, "players/" + id + "/status-done", { done: true }));
    await ok(action(host, "status-stage", { stage: 1 }));
    await ok(action(host, "status-stage", { stage: 2 }));
    for (const step of [2, 4, 8, 16, 32, 64]) await ok(action(host, "status-step", { step, done: true }));
    game = await ok(action(host, "round/next"));
    assert.equal(game.currentRound, 2);
    assert.equal(game.speakerPlayerId, c);

    database.close();
    database = new DatabaseSync(databasePath);
    game = await ok(call(byCode, third));
    assert.equal(game.currentRound, 2);
    assert.equal(game.callerPlayerId, c);
    assert.ok((await ok(call(byCode + "/log", third))).some(event => event.kind === 3));
    assert.equal((await call(base, bDevice, "DELETE")).status, 403);
    assert.equal((await call(base, host, "DELETE")).status, 204);
    assert.equal((await call(byCode, bDevice)).status, 404);
});
