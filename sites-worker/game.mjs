export const Phase = Object.freeze({ setup: 0, strategy: 1, action: 2, status: 3 });
const Status = Object.freeze({ scoring: 0, reveal: 1, checklist: 2 });
const Event = Object.freeze({
    phase: 1, round: 2, turn: 3, join: 4, player: 5, speaker: 6, pick: 7, play: 9, pass: 10,
    secondaryStart: 25, secondaryDone: 26, secondaryOpen: 35, secondaryClose: 36, claim: 31,
    secondaryFollow: 41,
});
const palette = ["#e53935", "#1976d2", "#43a047", "#fdd835", "#111827", "#ec68a5", "#ef8b24", "#a64ac9"];
const statusFlags = [2, 4, 8, 16, 32, 64];

export class GameError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function requireRule(ok, message, status = 400) {
    if (!ok) throw new GameError(status, message);
}

const forbidden = ok => requireRule(ok, "This device cannot perform that action.", 403);
const conflict = (ok, message) => requireRule(ok, message, 409);
const cleanName = value => typeof value === "string" ? value.trim().slice(0, 40) : "";
const cleanColor = value => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
const seats = game => [...game.players].sort((a, b) => a.seatOrder - b.seatOrder);
const initiative = game => seats(game).sort((a, b) => (a.initiative ?? 99) - (b.initiative ?? 99));
const cardLimit = game => game.players.length <= 4 ? 2 : 1;
const finishedDraft = game => game.players.every(player => player.strategyCards.length === cardLimit(game));
const canActFor = (actor, player) => actor && (actor.isHost || actor.id === player?.id);
const hasStrategyAction = game => game.activeStrategyCardId != null || game.secondaryCardId != null;

export const caller = (game, deviceKey) => deviceKey ? game.players.find(player => player.deviceKey === deviceKey) : null;

function event(game, kind, actor = null, target = null, detail = null) {
    game.log.push({
        id: crypto.randomUUID(), timestampUtc: game.lastActivityUtc, kind,
        actorPlayerId: actor?.id ?? null, targetPlayerId: target?.id ?? null,
        phase: game.phase, round: game.currentRound, detail,
    });
}

function turn(game, actor, next) {
    game.activePlayerId = next?.id ?? null;
    event(game, Event.turn, actor, next);
}

function player(name, colorHex, seatOrder, deviceKey = null, isHost = false) {
    return {
        id: crypto.randomUUID(), name, colorHex, seatOrder, deviceKey, isHost,
        factionId: null, isReady: false, hasPassed: false, initiative: null,
        strategyCards: [], technologyIds: [], influence: 0,
        statusDone: false, secondaryPending: false, secondaryFollowing: false,
    };
}

function uniqueNames(names) {
    return names.every(Boolean) && new Set(names.map(name => name.toLowerCase())).size === names.length;
}

export function newTable(joinCode, body, deviceKey, timestamp) {
    const names = Array.isArray(body.playerNames) ? body.playerNames.map(cleanName) : [];
    requireRule(names.length >= 3 && names.length <= 8 && uniqueNames(names), "Enter 3–8 unique player names.");
    const colors = body.playerColors == null ? palette.slice(0, names.length)
        : Array.isArray(body.playerColors) ? body.playerColors.map(cleanColor) : [];
    requireRule(colors.length === names.length && colors.every(Boolean) && new Set(colors).size === names.length,
        "Choose a different player color for each seat.");
    const players = names.map((name, index) => player(name, colors[index], index, index === 0 ? deviceKey : null, index === 0));
    const game = {
        id: crypto.randomUUID(), joinCode, name: "Table Prototype", defaultLanguage: body.language === 1 ? 1 : 0,
        activeExpansions: 1, currentRound: 1, phase: Phase.setup, speakerPlayerId: players[0].id,
        activePlayerId: null, activeStrategyCardId: null, secondaryCardId: null, strategyActionId: null,
        secondaryOwnerId: null, speakerPending: false, players, objectives: [], strategyCardStates: [],
        agendaVotes: [], createdAtUtc: timestamp, lastActivityUtc: timestamp, statusStage: Status.scoring,
        statusStepsDone: 0, statusScorerId: null, strategyCardsPerPlayer: 0, undo: null, log: [],
    };
    event(game, Event.join, players[0], players[0], "host");
    return game;
}

export function view(game, revision, actor) {
    const { log, undo, players, ...session } = game;
    return {
        ...session, workerRevision: revision, callerPlayerId: actor?.id ?? null,
        undoActionId: undo?.ownerId === actor?.id ? undo?.id ?? null : null,
        undoDescription: undo?.ownerId === actor?.id ? undo?.description ?? null : null,
        players: players.map(({ deviceKey, ...player }) => ({ ...player, seatClaimed: deviceKey != null })),
    };
}

export function join(game, body, deviceKey, actor) {
    if (body.unclaimed === true) {
        // The original compact table allows any seated player to help in its shared admin panel.
        forbidden(actor);
        requireRule(game.phase === Phase.setup && game.players.length < 8, "Seats can be added during setup only (max. 8).");
        const name = cleanName(body.name);
        const color = cleanColor(body.colorHex);
        requireRule(uniqueNames([...game.players.map(p => p.name), name]), "Enter a unique player name.");
        requireRule(color && !game.players.some(p => p.colorHex === color), "Choose an unused player color.");
        const added = player(name, color, Math.max(...game.players.map(p => p.seatOrder)) + 1);
        game.players.push(added);
        event(game, Event.join, actor, added);
        return added;
    }

    const target = game.players.find(p => p.id === body.claimPlayerId);
    requireRule(target, "Choose an existing seat.", 404);
    conflict(!target.deviceKey || target.deviceKey === deviceKey, "That seat is already claimed.");
    if (actor && actor.id !== target.id) {
        // The host may select a different starting seat. Keep game ownership with their device.
        forbidden(actor.isHost && game.phase === Phase.setup);
        actor.deviceKey = null;
        actor.isHost = false;
        target.isHost = true;
        if (game.speakerPlayerId === actor.id) game.speakerPlayerId = target.id;
    }
    if (!target.deviceKey) {
        target.deviceKey = deviceKey;
        event(game, Event.claim, target, target);
    }
    return target;
}

function picker(game) {
    const order = seats(game);
    const speaker = Math.max(0, order.findIndex(p => p.id === game.speakerPlayerId));
    const clockwise = order.slice(speaker).concat(order.slice(0, speaker));
    const min = Math.min(...clockwise.map(p => p.strategyCards.length));
    return min < cardLimit(game) ? clockwise.find(p => p.strategyCards.length === min) : null;
}

function checkpoint(game, actor, description, patch, blocksOnSecondary = false) {
    game.undo = actor.id === game.activePlayerId ? {
        id: crypto.randomUUID(), ownerId: actor.id, description, patch, blocksOnSecondary,
    } : null;
}

function finishSecondaries(game, actor) {
    if (!game.secondaryCardId || game.players.some(p => p.secondaryPending)) return;
    event(game, Event.secondaryClose, actor);
    game.secondaryCardId = null;
    game.secondaryOwnerId = null;
}

export function change(game, actor, command, playerId, body, content) {
    forbidden(actor);
    const target = game.players.find(p => p.id === playerId);
    const active = game.players.find(p => p.id === game.activePlayerId);
    const isAction = game.phase === Phase.action;
    const isStatus = game.phase === Phase.status;

    switch (command) {
        case "edit-player": {
            requireRule(game.phase === Phase.setup, "Player setup is closed.");
            requireRule(target, "Player not found.", 404);
            if (body.name != null || body.colorHex != null) forbidden(canActFor(actor, target));
            if (body.name != null) {
                const name = cleanName(body.name);
                requireRule(uniqueNames([...game.players.filter(p => p !== target).map(p => p.name), name]), "Enter a unique player name.");
                target.name = name;
            }
            if (body.colorHex != null) {
                const color = cleanColor(body.colorHex);
                requireRule(color && !game.players.some(p => p !== target && p.colorHex === color), "Choose an unused player color.");
                target.colorHex = color;
            }
            if (body.factionId != null) {
                requireRule(typeof body.factionId === "string", "Unknown faction.");
                const factionId = body.factionId || null;
                requireRule(!factionId || content.factions.some(faction => faction.id === factionId), "Unknown faction.");
                conflict(!factionId || !game.players.some(p => p !== target && p.factionId === factionId), "That faction is already in use.");
                target.factionId = factionId;
                target.isReady = false;
            }
            if (body.isReady != null) {
                requireRule(typeof body.isReady === "boolean" && (!body.isReady || target.factionId), "Choose a faction before readying.");
                target.isReady = body.isReady;
            }
            event(game, Event.player, actor, target);
            break;
        }
        case "remove-player":
            requireRule(game.phase === Phase.setup && target && !target.isHost, "Only non-host seats can be removed during setup.");
            game.players = game.players.filter(p => p !== target);
            if (game.speakerPlayerId === target.id) game.speakerPlayerId = seats(game)[0].id;
            break;
        case "seat-order": {
            forbidden(actor.isHost);
            requireRule(game.phase === Phase.setup && Array.isArray(body.playerIds) &&
                body.playerIds.length === game.players.length && new Set(body.playerIds).size === game.players.length &&
                game.players.every(p => body.playerIds.includes(p.id)), "Send each seat exactly once during setup.");
            for (const p of game.players) p.seatOrder = body.playerIds.indexOf(p.id);
            break;
        }
        case "speaker": {
            if (game.phase === Phase.setup) forbidden(actor.isHost);
            else requireRule(isAction && game.activeStrategyCardId === 3 && game.speakerPending, "Politics is not awaiting a speaker.");
            const next = game.players.find(p => p.id === body.playerId);
            requireRule(next && next.id !== game.speakerPlayerId, "Choose a different speaker.");
            if (isAction) checkpoint(game, actor, "Appoint Speaker", { speakerPlayerId: game.speakerPlayerId, speakerPending: true });
            game.speakerPlayerId = next.id;
            game.speakerPending = false;
            event(game, Event.speaker, actor, next);
            break;
        }
        case "phase/start":
            forbidden(actor.isHost);
            requireRule(game.phase === Phase.setup && game.players.length >= 3 &&
                game.players.every(p => p.isReady && p.factionId), "At least three players must choose a faction and be ready.");
            game.phase = Phase.strategy;
            event(game, Event.round, actor);
            event(game, Event.phase, actor);
            break;
        case "pick": {
            const card = body.strategyCardId;
            requireRule(game.phase === Phase.strategy && target && picker(game) === target, "It is not that seat’s pick.");
            requireRule(Number.isInteger(card) && card >= 1 && card <= 8, "Unknown strategy card.");
            conflict(!game.players.some(p => p.strategyCards.some(c => c.strategyCardId === card)), "That card has already been picked.");
            target.strategyCards.push({ strategyCardId: card, isExhausted: false });
            const faction = content.factions.find(f => f.id === target.factionId);
            target.initiative = faction?.initiativeOverride ?? Math.min(...target.strategyCards.map(c => c.strategyCardId));
            event(game, Event.pick, actor, target, String(card));
            break;
        }
        case "phase/action":
            forbidden(actor.isHost);
            requireRule(game.phase === Phase.strategy && finishedDraft(game), "All seats must finish picking.");
            game.strategyCardStates = Array.from({ length: 8 }, (_, index) => {
                const strategyCardId = index + 1;
                const picked = game.players.some(p => p.strategyCards.some(c => c.strategyCardId === strategyCardId));
                const previous = game.strategyCardStates.find(c => c.strategyCardId === strategyCardId)?.tradeGoods ?? 0;
                return { strategyCardId, tradeGoods: picked ? 0 : previous + 1 };
            });
            game.phase = Phase.action;
            event(game, Event.phase, actor);
            turn(game, actor, initiative(game)[0]);
            break;
        case "active-strategy": {
            requireRule(isAction && active && !hasStrategyAction(game), "Finish the current strategy action first.");
            const card = active.strategyCards.find(c => c.strategyCardId === body.strategyCardId && !c.isExhausted);
            requireRule(card, "The active player does not own that unused card.");
            checkpoint(game, actor, "Play strategy card " + card.strategyCardId, { playedCard: card.strategyCardId }, true);
            card.isExhausted = true;
            game.activeStrategyCardId = game.secondaryCardId = card.strategyCardId;
            game.secondaryOwnerId = active.id;
            game.strategyActionId = crypto.randomUUID();
            game.speakerPending = card.strategyCardId === 3;
            event(game, Event.play, actor, active, String(card.strategyCardId));
            event(game, Event.secondaryOpen, actor, active, String(card.strategyCardId));
            for (const p of game.players) {
                p.secondaryPending = p !== active;
                p.secondaryFollowing = false;
                if (p.secondaryPending) event(game, Event.secondaryStart, actor, p, String(card.strategyCardId));
            }
            break;
        }
        case "primary/complete":
            conflict(isAction && active && body.actionId === game.strategyActionId &&
                body.strategyCardId === game.activeStrategyCardId && game.activeStrategyCardId != null, "The running strategy action changed.");
            requireRule(!game.speakerPending, "Appoint a speaker first.");
            checkpoint(game, actor, "Complete primary", { activeStrategyCardId: game.activeStrategyCardId });
            game.activeStrategyCardId = null;
            if (!game.secondaryCardId) game.strategyActionId = null;
            break;
        case "secondary-follow":
        case "secondary-done":
            if (command === "secondary-follow") forbidden(actor === target);
            conflict(isAction && target?.secondaryPending && body.actionId === game.strategyActionId &&
                game.secondaryCardId != null, "This secondary has already changed.");
            if (game.undo?.blocksOnSecondary) game.undo = null;
            if (command === "secondary-follow") {
                conflict(!target.secondaryFollowing, "This player is already following.");
                target.secondaryFollowing = true;
                event(game, Event.secondaryFollow, actor, target);
            } else {
                target.secondaryPending = target.secondaryFollowing = false;
                event(game, Event.secondaryDone, actor, target);
                finishSecondaries(game, actor);
                if (!hasStrategyAction(game)) game.strategyActionId = null;
            }
            break;
        case "undo": {
            forbidden(actor === active);
            const undo = game.undo;
            conflict(body.confirmed === true && undo?.id === body.actionId && undo?.ownerId === actor.id,
                "This action is no longer undoable.");
            if (undo.patch.playedCard) {
                active.strategyCards.find(c => c.strategyCardId === undo.patch.playedCard).isExhausted = false;
                game.activeStrategyCardId = game.secondaryCardId = game.secondaryOwnerId = game.strategyActionId = null;
                game.speakerPending = false;
                for (const p of game.players) p.secondaryPending = p.secondaryFollowing = false;
                event(game, Event.secondaryClose, actor);
            } else {
                Object.assign(game, undo.patch);
                if (game.activeStrategyCardId && !game.strategyActionId) game.strategyActionId = crypto.randomUUID();
            }
            game.undo = null;
            break;
        }
        case "turn/advance":
        case "pass": {
            requireRule(isAction && active && !hasStrategyAction(game), "Finish the active turn’s strategy action first.");
            if (command === "turn/advance") conflict(body.expectedPlayerId === active.id, "The active player changed.");
            if (command === "pass") {
                conflict(target === active && body.passed === true, "Only the active player can pass.");
                requireRule(active.strategyCards.every(c => c.isExhausted), "Play your strategy cards before passing.");
                active.hasPassed = true;
                event(game, Event.pass, actor, active);
            }
            const order = initiative(game);
            const index = order.indexOf(active);
            const next = order.slice(index + 1).concat(order.slice(0, index + 1)).find(p => !p.hasPassed);
            game.undo = null;
            turn(game, actor, next);
            break;
        }
        case "phase/status":
            forbidden(actor.isHost);
            requireRule(isAction && !hasStrategyAction(game) && game.players.every(p => p.hasPassed), "All players must pass first.");
            game.phase = Phase.status;
            game.statusStage = Status.scoring;
            game.statusStepsDone = 0;
            game.statusScorerId = initiative(game)[0].id;
            event(game, Event.phase, actor);
            break;
        case "status-done":
            conflict(isStatus && game.statusStage === Status.scoring && target && game.statusScorerId === target.id &&
                body.done === true, "It is not that player’s scoring step.");
            target.statusDone = true;
            game.statusScorerId = initiative(game).find(p => !p.statusDone)?.id ?? null;
            break;
        case "status-stage":
            forbidden(actor.isHost);
            conflict(isStatus && game.statusScorerId == null && body.stage === game.statusStage + 1 &&
                body.stage <= Status.checklist, "Finish the current status step first.");
            game.statusStage = body.stage;
            if (body.stage === Status.checklist) game.statusStepsDone |= 1;
            break;
        case "status-step":
            forbidden(actor.isHost);
            requireRule(isStatus && game.statusStage === Status.checklist && statusFlags.includes(body.step) &&
                typeof body.done === "boolean", "Unknown or unavailable status step.");
            game.statusStepsDone = body.done ? game.statusStepsDone | body.step : game.statusStepsDone & ~body.step;
            break;
        case "round/next":
            forbidden(actor.isHost);
            requireRule(isStatus && game.statusStage === Status.checklist && game.statusStepsDone === 127, "Finish the status checklist first.");
            game.phase = Phase.strategy;
            game.currentRound++;
            game.statusStage = Status.scoring;
            game.statusStepsDone = 0;
            for (const p of game.players) {
                p.strategyCards = [];
                p.initiative = null;
                p.hasPassed = p.statusDone = false;
            }
            event(game, Event.round, actor);
            event(game, Event.phase, actor);
            break;
        default:
            throw new GameError(404, "This endpoint is not part of the compact table.");
    }
}
