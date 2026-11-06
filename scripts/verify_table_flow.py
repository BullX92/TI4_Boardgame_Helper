"""Exercise disposable local sessions against the running server; never prints device tokens."""
import concurrent.futures
import json
import os
import uuid
import urllib.error
import urllib.request
from pathlib import Path

BASE = os.environ.get("TI4_BASE_URL", "http://localhost:5116").rstrip("/") + "/api/sessions"


def call(path="", body=None, token=None, method="POST", expected=(200,)):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["X-Device-Token"] = token
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        response = urllib.request.urlopen(request, timeout=30)
        status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    assert status in expected, (path, status, raw[:180])
    return status, json.loads(raw) if raw else None


def new_table(count):
    creator = uuid.uuid4().hex
    _, result = call(body={"name": "Table Prototype", "language": 0,
                          "hostName": "Player 1", "deviceToken": creator,
                          "playerNames": [f"Player {i + 1}" for i in range(count)]})
    return result["session"], creator


def verify(count):
    s, creator = new_table(count)
    ids = [p["id"] for p in s["players"]]
    path = "/" + s["id"]
    assert len(ids) == count and sum(p["seatClaimed"] for p in s["players"]) == 1
    # The creator selects another name; the host role follows the creator's device.
    _, claimed = call(path + "/players", {"name": "", "deviceToken": creator,
                                          "claimPlayerId": ids[-1]})
    assert next(p for p in claimed["session"]["players"] if p["id"] == ids[-1])["isHost"]
    tokens = [uuid.uuid4().hex for _ in ids]
    tokens[-1] = creator
    for i in range(count - 1):
        call(path + "/players", {"name": "", "deviceToken": tokens[i], "claimPlayerId": ids[i]})
    call(path + "/players", {"name": "Intruder", "deviceToken": uuid.uuid4().hex}, expected=(403,))
    call(path + "/players", {"name": "", "deviceToken": uuid.uuid4().hex,
                              "claimPlayerId": ids[0]}, expected=(409,))
    call(path + "/phase/start", {}, creator, expected=(400,))
    call(path + "/players/" + ids[0], {"isReady": True}, tokens[0], "PATCH", (400,))
    factions = ["sol", "hacan", "sardakk", "naalu"]
    for i in range(count):
        call(path + "/players/" + ids[i], {"factionId": factions[i], "isReady": True}, tokens[i], "PATCH")
    call(path + "/speaker", {"playerId": ids[0]}, creator)
    # A saved prototype from the first demo may still contain the old one-card override.
    call(path, {"strategyCardsPerPlayer": 1, "promptTechOnAction": True}, creator, "PATCH")
    call(path + "/phase/start", {}, creator)
    call(path + "/phase/action", {}, creator, expected=(400,))
    # Duplicate concurrent picks cannot exhaust the next pick or steal an owned card.
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        jobs = [pool.submit(call, path + "/players/" + ids[0] + "/strategy-cards",
                            {"strategyCardId": 1}, tokens[0], "POST", (200, 400, 409)) for _ in range(2)]
        statuses = [job.result()[0] for job in jobs]
    assert statuses.count(200) == 1, statuses
    call(path + "/players/" + ids[1] + "/strategy-cards", {"strategyCardId": 1}, tokens[1], expected=(409,))
    for card in range(2, count * 2 + 1):
        seat = (card - 1) % count
        call(path + "/players/" + ids[seat] + "/strategy-cards", {"strategyCardId": card}, tokens[seat])
    _, s = call(path + "/phase/action", {}, creator)
    assert all(len(p["strategyCards"]) == 2 for p in s["players"])
    assert s["activePlayerId"] == (ids[3] if count == 4 else ids[0])
    used, passed_secondaries = [], 0
    for _ in range(count * 2):
        actor = next(p for p in s["players"] if p["id"] == s["activePlayerId"])
        index = ids.index(actor["id"])
        token = tokens[index]
        card = next(c["strategyCardId"] for c in actor["strategyCards"] if not c["isExhausted"])
        _, s = call(path + "/active-strategy", {"strategyCardId": card}, token)
        assert s["secondaryCardId"] == card and s["activeStrategyCardId"] == card
        assert sum(p["secondaryPending"] for p in s["players"]) == count - 1
        call(path + "/turn/advance", None, token, expected=(400,))
        if card == 3:
            call(path + "/primary/complete", {"strategyCardId": card}, token, expected=(400,))
            target = next(p["id"] for p in s["players"] if p["id"] != s["speakerPlayerId"])
            call(path + "/speaker", {"playerId": target}, token)
        primary_first = card % 2 == 0
        if primary_first:
            _, s = call(path + "/primary/complete", {"strategyCardId": card}, token)
            assert s["activeStrategyCardId"] is None and s["secondaryCardId"] == card
        order = [ids[(index + delta) % count] for delta in range(1, count)]
        for target in reversed(order):
            passed_secondaries += next(p for p in s["players"] if p["id"] == target)["hasPassed"]
            _, s = call(path + "/players/" + target + "/secondary-done", {}, tokens[ids.index(target)])
        used.append(card)
        if not primary_first:
            assert s["secondaryCardId"] is None and s["activeStrategyCardId"] == card
            if card == 7:
                assert not s["techPromptOpen"], "Do not ask for researched technologies while the primary is still open"
            call(path + "/turn/advance", None, token, expected=(400,))
            _, s = call(path + "/primary/complete", {"strategyCardId": card}, token)
        assert s["secondaryCardId"] is None and s["activeStrategyCardId"] is None
        if card == 7:
            assert s["techPromptOpen"], "Research entry opens only after primary and secondaries"
        actor = next(p for p in s["players"] if p["id"] == actor["id"])
        if all(c["isExhausted"] for c in actor["strategyCards"]):
            _, s = call(path + "/players/" + actor["id"] + "/pass", {"passed": True}, token)
        else:
            call(path + "/players/" + actor["id"] + "/pass", {"passed": True}, token, expected=(400,))
            _, s = call(path + "/turn/advance", None, token)
    assert all(p["hasPassed"] for p in s["players"]) and s["activePlayerId"] is None
    assert len(used) == count * 2 and len(set(used)) == len(used)
    assert passed_secondaries > 0 and s["turnTimerSeconds"] == 0
    _, saved = call("/" + s["joinCode"], token=creator, method="GET")
    assert all(p["hasPassed"] for p in saved["players"])
    return {"players": count, "cards_each": 2, "played_cards": len(used),
            "passed_player_secondaries": passed_secondaries, "all_passed": True,
            "duplicate_picks_rejected": True, "timer_limit": 0}


def verify_claim_race():
    s, _ = new_table(3)
    target = s["players"][1]["id"]
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        jobs = [pool.submit(call, "/" + s["id"] + "/players",
                            {"name": "", "deviceToken": uuid.uuid4().hex, "claimPlayerId": target},
                            None, "POST", (200, 409)) for _ in range(2)]
        result = sorted(job.result()[0] for job in jobs)
    assert result == [200, 409], result
    return True


if __name__ == "__main__":
    report = {"seat_claim_race_rejected": verify_claim_race(), "sessions": [verify(3), verify(4)]}
    output = Path(__file__).resolve().parent.parent / "artifacts" / "named-session-checks.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
