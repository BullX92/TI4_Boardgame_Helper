import { caller, change, GameError, join, newTable, view } from "./game.mjs";
import { TableStore } from "./store.mjs";
import content from "./content.json" with { type: "json" };
import shell from "./shell.html";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const codePattern = /^[A-Z0-9]{5}$/;
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const commands = new Set([
    "seat-order", "speaker", "phase/start", "phase/action", "active-strategy", "primary/complete",
    "undo", "turn/advance", "phase/status", "status-stage", "status-step", "round/next",
]);
const playerCommands = new Map([
    ["strategy-cards", "pick"], ["pass", "pass"], ["secondary-follow", "secondary-follow"],
    ["secondary-done", "secondary-done"], ["status-done", "status-done"],
]);

function json(value, status = 200, extra = {}) {
    return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...extra } });
}

function reject(status, reason) {
    throw new GameError(status, reason);
}

function randomCode() {
    return Array.from(crypto.getRandomValues(new Uint8Array(5)), byte => alphabet[byte & 31]).join("");
}

async function credentials(request) {
    const user = request.headers.get("oai-authenticated-user-id");
    if (!user) reject(401, "Sign in to use the table.");
    const token = request.headers.get("X-Device-Token");
    if (!token || !/^[0-9a-f]{32}$/i.test(token)) return { key: null };
    const data = new TextEncoder().encode(JSON.stringify([user, token.toLowerCase()]));
    const digest = await crypto.subtle.digest("SHA-256", data);
    return { key: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join(""), token };
}

async function readBody(request) {
    if (!request.body) return {};
    const reader = request.body.getReader();
    const bytes = new Uint8Array(8192);
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (size + value.length > bytes.length) {
            await reader.cancel();
            reject(413, "Request is too large.");
        }
        bytes.set(value, size);
        size += value.length;
    }
    try {
        const body = JSON.parse(new TextDecoder().decode(bytes.subarray(0, size)));
        if (body && typeof body === "object" && !Array.isArray(body)) return body;
    } catch { /* Return a stable client error for malformed JSON. */ }
    reject(400, "Send a JSON object.");
}

function etag(revision) {
    return `"${revision}"`;
}

async function readTable(request, store, code, resource, device) {
    const record = await store.byCode(code);
    if (!record) reject(404, "Table not found.");
    if (!resource && request.headers.get("If-None-Match") === etag(record.revision)) {
        return new Response(null, { status: 304, headers: { "Cache-Control": "no-store", ETag: etag(record.revision) } });
    }
    const game = JSON.parse(record.document);
    const actor = caller(game, device.key);
    if (resource === "log") {
        if (!actor) reject(403, "Join a seat to view table times.");
        return json(game.log);
    }
    return json(view(game, record.revision, actor), 200, { ETag: etag(record.revision) });
}

async function createTable(store, body, device) {
    for (let attempt = 0; attempt < 8; attempt++) {
        const game = newTable(randomCode(), body, device.key, new Date().toISOString());
        if (!await store.create(game)) continue;
        const host = game.players[0];
        return json({ session: view(game, 1, host), playerId: host.id, deviceToken: device.token });
    }
    reject(503, "Unable to allocate a table code. Try again.");
}

function route(method, tail) {
    if (method === "DELETE" && !tail.length) return { command: "delete" };
    if (tail[0] === "players") {
        if (method === "POST" && tail.length === 1) return { command: "join" };
        if (uuid.test(tail[1] ?? "")) {
            const playerId = tail[1];
            if (method === "PATCH" && tail.length === 2) return { command: "edit-player", playerId };
            if (method === "DELETE" && tail.length === 2) return { command: "remove-player", playerId };
            if (method === "POST" && tail.length === 3 && playerCommands.has(tail[2])) {
                return { command: playerCommands.get(tail[2]), playerId };
            }
        }
    }
    const command = tail.join("/");
    if (method === "POST" && commands.has(command)) return { command };
    reject(404, "This endpoint is not part of the compact table.");
}

async function mutateTable(store, id, action, body, device) {
    const { command, playerId } = action;
    // Re-read and re-validate on conflict. Independent replies to a strategy card can both succeed,
    // while the same seat, card or turn cannot be claimed twice.
    for (let attempt = 0; attempt < 8; attempt++) {
        const record = await store.byId(id);
        if (!record) reject(404, "Table not found.");
        const game = JSON.parse(record.document);
        const actor = caller(game, device.key);
        if (command === "delete") {
            if (!actor?.isHost) reject(403, "Only the host can delete a table.");
            if (await store.remove(id, record.revision)) return new Response(null, { status: 204 });
            continue;
        }

        if (command === "turn/advance" && body.expectedRevision !== record.revision) {
            reject(409, "The table changed. Refresh before ending the turn.");
        }
        game.lastActivityUtc = new Date().toISOString();
        let joined;
        if (command === "join") joined = join(game, body, device.key, actor);
        else change(game, actor, command, playerId, body, content);
        // Keep the D1 row well within its size limit, retaining the latest 2,500 timeline events.
        if (game.log.length > 2500) game.log.splice(0, game.log.length - 2500);
        if (!await store.replace(game, record.revision)) continue;
        const session = view(game, record.revision + 1, caller(game, device.key));
        return json(joined ? { session, playerId: joined.id, deviceToken: device.token } : session);
    }
    reject(409, "The table is busy. Refresh and try again.");
}

async function api(request, env, url) {
    const device = await credentials(request);
    const { pathname } = url;
    const method = request.method;
    if (method === "GET") {
        if (pathname === "/api/content") return json(content);
        if (pathname === "/api/instance") return json({ label: "" });
        if (pathname === "/api/push/key") return json({ publicKey: "" });
        if (pathname === "/api/notice") return json({ text: "" });
        if (pathname === "/api/version") return json({ revision: "sites-worker" });
    }

    const parts = pathname.replace(/\/$/, "").split("/").slice(1);
    if (parts[1] !== "sessions") reject(404, "Endpoint not found.");
    const store = new TableStore(env.DB);
    const [, , idOrCode, ...tail] = parts;
    if (method === "GET") {
        const code = idOrCode?.toUpperCase();
        if (!codePattern.test(code ?? "") || (tail.length && (tail.length !== 1 || tail[0] !== "log"))) {
            reject(404, "Table not found.");
        }
        return readTable(request, store, code, tail[0], device);
    }

    if (!device.key) reject(401, "A device token is required.");
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) reject(403, "Requests must come from this site.");
    if (method === "POST" && !idOrCode) return createTable(store, await readBody(request), device);
    if (!uuid.test(idOrCode ?? "")) reject(404, "Table not found.");
    const action = route(method, tail);
    return mutateTable(store, idOrCode, action, await readBody(request), device);
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        try {
            if (request.method === "GET" && url.pathname === "/health") {
                await env.DB.prepare("SELECT id FROM ti4_tables LIMIT 1").first();
                return json({ status: "ok" });
            }
            if (url.pathname.startsWith("/api/")) return await api(request, env, url);
            if (request.method !== "GET" && request.method !== "HEAD") reject(405, "Method not allowed.");
            if (url.pathname === "/" || url.pathname === "/prototype.html") {
                return Response.redirect(new URL("/table" + url.search, url), 302);
            }
            if (/^\/table(?:\/[a-z0-9]{5})?\/?$/i.test(url.pathname)) {
                return new Response(request.method === "HEAD" ? null : shell, {
                    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
                });
            }
            return env.ASSETS.fetch(request);
        } catch (error) {
            if (error instanceof GameError) return json({ error: error.message }, error.status);
            console.error("TI4 Worker request failed", url.pathname.startsWith("/api/") ? "api" : "assets", error.name);
            return json({ error: "The table service is temporarily unavailable." }, 503);
        }
    },
};
