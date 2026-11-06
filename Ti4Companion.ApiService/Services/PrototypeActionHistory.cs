using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Ti4Companion.ApiService.Data;
using Ti4Companion.Shared;

namespace Ti4Companion.ApiService.Services;

/// <summary>Persistent, field-level undo for one's own actions in the current prototype turn.</summary>
public static class PrototypeActionHistory
{
    private sealed record Pending(Guid Owner, string Label, Dictionary<string, string?> Before, HashSet<Guid> ExistingLogs);
    public sealed record Checkpoint(Guid Owner, Guid Turn, string Label, Dictionary<string, string?> Before,
        Dictionary<string, string?> After, Guid[] Events, bool Undone = false);
    private static readonly ConditionalWeakTable<Ti4DbContext, Pending> PendingActions = new();

    public static void Begin(Ti4DbContext db, GameSession session, Guid? owner, string label)
    {
        if (session.Name != "Table Prototype" || session.Phase != GamePhase.Action || owner is not Guid id) return;
        PendingActions.Remove(db);
        PendingActions.Add(db, new(id, label, Capture(session), db.ChangeTracker.Entries<SessionLogEntry>()
            .Where(e => e.State == EntityState.Added).Select(e => e.Entity.Id).ToHashSet()));
    }

    public static async Task CompleteAsync(Ti4DbContext db, GameSession session, CancellationToken ct)
    {
        if (!PendingActions.TryGetValue(db, out var pending)) return;
        PendingActions.Remove(db);
        var after = Capture(session);
        var events = db.ChangeTracker.Entries<SessionLogEntry>()
            .Where(e => e.State == EntityState.Added && e.Entity.SessionId == session.Id && !pending.ExistingLogs.Contains(e.Entity.Id))
            .Select(e => e.Entity.Id).ToArray();
        if (events.Length == 0 && pending.Before.All(p => after.GetValueOrDefault(p.Key) == p.Value)) return;
        var turn = await CurrentTurnAsync(db, session.Id, ct);
        if (turn is null) return;
        db.SessionLog.Add(new SessionLogEntry
        {
            SessionId = session.Id, Kind = SessionLogKind.PrototypeCheckpoint, ActorPlayerId = pending.Owner,
            Round = session.CurrentRound,
            Detail = JsonSerializer.Serialize(new Checkpoint(pending.Owner, turn.Value, pending.Label, pending.Before, after, events))
        });
    }

    private static async Task<Guid?> CurrentTurnAsync(Ti4DbContext db, Guid id, CancellationToken ct)
    {
        var saved = await db.SessionLog.AsNoTracking().Where(l => l.SessionId == id && l.Kind == SessionLogKind.TurnChange)
            .Select(l => new { l.Id, l.TimestampUtc }).ToListAsync(ct);
        var deleted = db.ChangeTracker.Entries<SessionLogEntry>().Where(e => e.State == EntityState.Deleted).Select(e => e.Entity.Id).ToHashSet();
        var all = saved.Where(l => !deleted.Contains(l.Id)).Select(l => (l.Id, l.TimestampUtc))
            .Concat(db.ChangeTracker.Entries<SessionLogEntry>()
                .Where(e => e.State == EntityState.Added && e.Entity.SessionId == id && e.Entity.Kind == SessionLogKind.TurnChange)
                .Select(e => (e.Entity.Id, e.Entity.TimestampUtc)));
        return all.OrderByDescending(l => l.TimestampUtc).Select(l => (Guid?)l.Id).FirstOrDefault();
    }

    private static async Task<(SessionLogEntry Row, Checkpoint Data)?> LatestAsync(Ti4DbContext db, GameSession s, CancellationToken ct)
    {
        if (s.Name != "Table Prototype" || s.Phase != GamePhase.Action || s.ActivePlayerId is not Guid owner) return null;
        var turn = await CurrentTurnAsync(db, s.Id, ct);
        if (turn is null) return null;
        var rows = await db.SessionLog.Where(l => l.SessionId == s.Id && l.Kind == SessionLogKind.PrototypeCheckpoint
            && l.ActorPlayerId == owner && l.Round == s.CurrentRound).ToListAsync(ct);
        foreach (var row in rows.OrderByDescending(l => l.TimestampUtc))
        {
            var data = JsonSerializer.Deserialize<Checkpoint>(row.Detail!);
            if (data is not null && !data.Undone && data.Turn == turn && data.Before.GetValueOrDefault("active") == owner.ToString())
                return (row, data);
        }
        return null;
    }

    private static bool CanApply(GameSession s, Checkpoint data)
    {
        if (data.Before.GetValueOrDefault("primary") is null && data.After.GetValueOrDefault("primary") is not null
            && s.Players.Any(p => p.SecondaryFollowing)) return false;
        var current = Capture(s);
        return data.Before.Where(p => p.Value != data.After.GetValueOrDefault(p.Key))
            .All(p => current.TryGetValue(p.Key, out var value) && value == data.After.GetValueOrDefault(p.Key));
    }

    public static async Task DescribeAsync(Ti4DbContext db, GameSession s, CancellationToken ct)
    {
        s.UndoActionId = null; s.UndoDescription = null; s.UndoUnavailableReason = null;
        await LoadFollowingAsync(db, s, ct);
        var found = await LatestAsync(db, s, ct);
        if (found is not { } checkpoint) return;
        s.UndoDescription = checkpoint.Data.Label;
        if (CanApply(s, checkpoint.Data)) s.UndoActionId = checkpoint.Row.Id;
        else s.UndoUnavailableReason = "Another player has changed this action. Their decisions cannot be undone.";
    }

    public static async Task LoadFollowingAsync(Ti4DbContext db, GameSession s, CancellationToken ct)
    {
        s.StrategyActionId = await CurrentStrategyActionAsync(db, s, ct);
        foreach (var player in s.Players) player.SecondaryFollowing = false;
        if (s.StrategyActionId is not Guid action) return;
        var detail = action.ToString();
        var followers = await db.SessionLog.AsNoTracking().Where(l => l.SessionId == s.Id
            && l.Kind == SessionLogKind.SecondaryFollow && l.Detail == detail).Select(l => l.TargetPlayerId).ToListAsync(ct);
        foreach (var player in s.Players) player.SecondaryFollowing = followers.Contains(player.Id);
    }

    public static async Task<Guid?> CurrentStrategyActionAsync(Ti4DbContext db, GameSession s, CancellationToken ct)
    {
        if (s.Name != "Table Prototype" || s.Phase != GamePhase.Action || (s.ActiveStrategyCardId ?? s.SecondaryCardId) is not int card) return null;
        var detail = card.ToString();
        var rows = await db.SessionLog.AsNoTracking().Where(l => l.SessionId == s.Id && l.Kind == SessionLogKind.StrategyAction
            && l.TargetPlayerId == s.ActivePlayerId && l.Detail == detail).Select(l => new { l.Id, l.TimestampUtc }).ToListAsync(ct);
        return rows.OrderByDescending(l => l.TimestampUtc).Select(l => (Guid?)l.Id).FirstOrDefault();
    }

    public static async Task<bool> UndoAsync(Ti4DbContext db, GameSession s, Guid expected, CancellationToken ct)
    {
        await LoadFollowingAsync(db, s, ct);
        var found = await LatestAsync(db, s, ct);
        if (found is not { } checkpoint || checkpoint.Row.Id != expected || !CanApply(s, checkpoint.Data)) return false;
        foreach (var change in checkpoint.Data.Before.Where(p => p.Value != checkpoint.Data.After.GetValueOrDefault(p.Key)))
            Restore(s, change.Key, change.Value);
        var logs = await db.SessionLog.Where(l => l.SessionId == s.Id && checkpoint.Data.Events.Contains(l.Id)).ToListAsync(ct);
        db.SessionLog.RemoveRange(logs);
        checkpoint.Row.Detail = JsonSerializer.Serialize(checkpoint.Data with { Undone = true });
        db.SessionLog.Add(new SessionLogEntry { SessionId = s.Id, Kind = SessionLogKind.PrototypeUndo,
            ActorPlayerId = s.ActivePlayerId, Round = s.CurrentRound, Detail = checkpoint.Data.Label });
        return true;
    }

    private static Dictionary<string, string?> Capture(GameSession s)
    {
        var state = new Dictionary<string, string?>
        {
            ["active"] = s.ActivePlayerId?.ToString(), ["primary"] = s.ActiveStrategyCardId?.ToString(),
            ["secondary"] = s.SecondaryCardId?.ToString(), ["secondaryOwner"] = s.SecondaryOwnerId?.ToString(),
            ["speaker"] = s.SpeakerPlayerId?.ToString(), ["speakerPending"] = s.SpeakerPending.ToString(),
            ["combatA"] = s.CombatAId?.ToString(), ["combatB"] = s.CombatBId?.ToString(),
            ["techPick"] = s.TechPickPlayerId?.ToString(), ["techOpen"] = s.TechPromptOpen.ToString(),
            ["techOwner"] = s.TechPromptOwnerId?.ToString()
        };
        foreach (var p in s.Players)
        {
            state[$"p:{p.Id}:passed"] = p.HasPassed.ToString();
            state[$"p:{p.Id}:secondary"] = p.SecondaryPending.ToString();
            state[$"p:{p.Id}:tech"] = p.TechPromptPending.ToString();
            foreach (var card in p.StrategyCards) state[$"p:{p.Id}:card:{card.StrategyCardId}"] = card.IsExhausted.ToString();
        }
        return state;
    }

    private static void Restore(GameSession s, string key, string? value)
    {
        static Guid? G(string? v) => v is null ? null : Guid.Parse(v);
        static int? I(string? v) => v is null ? null : int.Parse(v);
        switch (key)
        {
            case "active": s.ActivePlayerId = G(value); break;
            case "primary": s.ActiveStrategyCardId = I(value); break;
            case "secondary": s.SecondaryCardId = I(value); break;
            case "secondaryOwner": s.SecondaryOwnerId = G(value); break;
            case "speaker": s.SpeakerPlayerId = G(value); break;
            case "speakerPending": s.SpeakerPending = bool.Parse(value!); break;
            case "combatA": s.CombatAId = G(value); break;
            case "combatB": s.CombatBId = G(value); break;
            case "techPick": s.TechPickPlayerId = G(value); break;
            case "techOpen": s.TechPromptOpen = bool.Parse(value!); break;
            case "techOwner": s.TechPromptOwnerId = G(value); break;
            default:
                var parts = key.Split(':');
                var player = s.Players.First(p => p.Id == Guid.Parse(parts[1]));
                switch (parts[2])
                {
                    case "passed": player.HasPassed = bool.Parse(value!); break;
                    case "secondary": player.SecondaryPending = bool.Parse(value!); break;
                    case "tech": player.TechPromptPending = bool.Parse(value!); break;
                    case "card": player.StrategyCards.First(c => c.StrategyCardId == int.Parse(parts[3])).IsExhausted = bool.Parse(value!); break;
                }
                break;
        }
    }
}
