"""HTTP regression checks for independent primary/secondaries and own-action undo."""
import concurrent.futures
import json
import uuid
from pathlib import Path
from verify_table_flow import call, new_table


def fixture():
    s, creator = new_table(3)
    ids = [p["id"] for p in s["players"]]
    tokens = [creator, uuid.uuid4().hex, uuid.uuid4().hex]
    path = "/" + s["id"]
    for i in range(1, 3):
        call(path + "/players", {"name": "", "deviceToken": tokens[i], "claimPlayerId": ids[i]})
    for i, faction in enumerate(["sol", "hacan", "sardakk"]):
        call(path + "/players/" + ids[i], {"factionId": faction, "isReady": True}, tokens[i], "PATCH")
    call(path + "/phase/start", {}, creator)
    for card in range(1, 7):
        i = (card - 1) % 3
        call(path + "/players/" + ids[i] + "/strategy-cards", {"strategyCardId": card}, tokens[i])
    _, s = call(path + "/phase/action", {}, creator)
    return s, path, ids, tokens


def verify():
    s, path, ids, tokens = fixture()

    def read():
        return call("/" + s["joinCode"], token=tokens[0], method="GET")[1]

    def undo(action, token=tokens[0], expected=(200,), confirmed=True):
        return call(path + "/undo", {"actionId": action, "confirmed": confirmed}, token, expected=expected)

    def play(card, index=0):
        return call(path + "/active-strategy", {"strategyCardId": card}, tokens[index])[1]

    def finish_primary(card, index=0, action=None, expected=(200,)):
        return call(path + "/primary/complete", {"strategyCardId": card, "actionId": action}, tokens[index], expected=expected)[1]

    def finish_secondary(index, action=None, expected=(200,)):
        return call(path + "/players/" + ids[index] + "/secondary-done", {"actionId": action}, tokens[index], expected=expected)[1]

    first = play(1)
    checkpoint, nonce = first["undoActionId"], first["strategyActionId"]
    assert checkpoint and nonce and read()["undoActionId"] == checkpoint
    undo(checkpoint, confirmed=False, expected=(400,))
    undo(checkpoint, tokens[1], (403,))
    undo(str(uuid.uuid4()), expected=(409,))
    assert read()["undoActionId"] == checkpoint
    _, restored = undo(checkpoint)
    assert restored["activeStrategyCardId"] is None and restored["secondaryCardId"] is None
    assert not any(p["secondaryPending"] for p in restored["players"])
    assert not next(c for c in restored["players"][0]["strategyCards"] if c["strategyCardId"] == 1)["isExhausted"]
    undo(checkpoint, expected=(409,))

    replayed = play(1)
    assert replayed["strategyActionId"] != nonce
    finish_secondary(1, nonce, (409,))
    finish_primary(1, action=nonce, expected=(409,))
    _, following = call(path + "/players/" + ids[2] + "/secondary-follow", {"actionId": replayed["strategyActionId"]}, tokens[2])
    assert next(p for p in following["players"] if p["id"] == ids[2])["secondaryFollowing"]
    assert read()["undoActionId"] is None
    undo(replayed["undoActionId"], expected=(409,))
    assert next(p for p in read()["players"] if p["id"] == ids[2])["secondaryFollowing"]
    # The last seat answers before the first seat and before the primary.
    responded = finish_secondary(2, replayed["strategyActionId"])
    assert responded["activeStrategyCardId"] == 1
    assert not next(p for p in responded["players"] if p["id"] == ids[2])["secondaryPending"]
    assert responded["undoActionId"] is None and responded["undoUnavailableReason"]
    undo(replayed["undoActionId"], expected=(409,))
    primary = finish_primary(1, action=replayed["strategyActionId"])
    assert primary["activeStrategyCardId"] is None and primary["secondaryCardId"] == 1
    primary_checkpoint = primary["undoActionId"]
    finish_secondary(1, replayed["strategyActionId"])
    _, restored = undo(primary_checkpoint)
    assert restored["activeStrategyCardId"] == 1 and restored["secondaryCardId"] is None
    assert not any(p["secondaryPending"] for p in restored["players"]), "Undo must preserve other players' responses"
    finish_primary(1)
    call(path + "/turn/advance", None, tokens[0])
    assert read()["undoActionId"] is None, "A new active player cannot undo their earlier turn"
    undo(primary_checkpoint, expected=(403,))
    call(path + "/turn/advance", None, tokens[1])

    # Politics: secondaries can finish before the Speaker appointment and primary.
    politics = play(3, 2)
    finish_secondary(0, politics["strategyActionId"])
    finish_secondary(1, politics["strategyActionId"])
    finish_primary(3, 2, expected=(400,))
    _, appointed = call(path + "/speaker", {"playerId": ids[1]}, tokens[2])
    _, reverted_speaker = undo(appointed["undoActionId"], tokens[2])
    assert reverted_speaker["speakerPlayerId"] == ids[0] and reverted_speaker["speakerPending"]
    assert not any(p["secondaryPending"] for p in reverted_speaker["players"])
    call(path + "/speaker", {"playerId": ids[1]}, tokens[2])
    finish_primary(3, 2)
    call(path + "/turn/advance", None, tokens[2])

    # Two confirmations of one Undo must apply it exactly once.
    played = play(4)
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        jobs = [pool.submit(undo, played["undoActionId"], tokens[0], (200, 409)) for _ in range(2)]
        statuses = sorted(job.result()[0] for job in jobs)
    assert statuses == [200, 409]
    last = read()
    assert last["activeStrategyCardId"] is None and last["secondaryCardId"] is None
    simultaneous = play(4)
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        jobs = [pool.submit(finish_secondary, i, simultaneous["strategyActionId"]) for i in [1, 2]]
        for job in jobs:
            job.result()
    parallel = read()
    assert parallel["activeStrategyCardId"] == 4 and parallel["secondaryCardId"] is None
    assert not any(p["secondaryPending"] for p in parallel["players"])
    finish_primary(4)
    _, logs = call("/" + s["joinCode"] + "/log", method="GET")
    assert not any(log["kind"] == 39 for log in logs), "Internal undo snapshots must stay out of the public log"
    return {"parallel_secondary_before_primary": True, "concurrent_secondary_answers": True, "both_completion_orders": True,
            "politics_secondaries_before_speaker": True, "confirmation_required": True,
            "only_active_players_own_current_turn": True, "other_players_preserved": True, "follow_survives_reload_and_blocks_cancel": True,
            "stale_responses_rejected_after_undo": True, "double_undo_once": True,
            "undo_restores_card_and_speaker": True, "fresh_db_read_retains_undo": True}


if __name__ == "__main__":
    result = verify()
    out = Path(__file__).resolve().parent.parent / "artifacts" / "parallel-undo-checks.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
