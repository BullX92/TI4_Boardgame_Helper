"""Shared PrototypeAdminPanel contract checks. Stdlib; isolated loopback :18094 only.
Creates its own fixtures, never reads or mutates existing tables. Run on the Docker host.
"""
import json
import os
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get('TI4_BASE_URL', 'http://127.0.0.1:18094').rstrip('/')
if BASE not in ('http://127.0.0.1:18094', 'http://localhost:18094', 'http://[::1]:18094'):
    raise SystemExit('Refusing non-isolated URL: only loopback port 18094 is permitted')
created = set()
checks = 0


def call(path='', body=None, token=None, method='POST', expected=200):
    global checks
    if path:
        assert path.split('/')[1] in created, 'Only fixtures created by this run may be accessed'
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['X-Device-Token'] = token
    req = urllib.request.Request(BASE + '/api/sessions' + path,
                                 data=None if body is None else json.dumps(body).encode(),
                                 headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    assert status == expected, f'{method} {path}: expected {expected}, got {status}: {raw[:180]!r}'
    checks += 1
    return json.loads(raw) if raw else None


def fixture():
    token = uuid.uuid4().hex
    result = call(body={'name': 'Table Prototype', 'language': 0, 'deviceToken': token,
                        'playerNames': ['Host', 'Shared admin', 'Third player']})
    s = result['session']
    created.update((s['id'], s['joinCode']))
    return s, token


def verify():
    s, host = fixture()
    foreign, foreign_token = fixture()
    path = '/' + s['id']
    ids = [p['id'] for p in sorted(s['players'], key=lambda p: p['seatOrder'])]
    admin = uuid.uuid4().hex
    call(path + '/players', {'name': '', 'deviceToken': admin, 'claimPlayerId': ids[1]})
    roles = {p['id']: p['isHost'] for p in s['players']}

    def read():
        state = call('/' + s['joinCode'], token=admin, method='GET')
        assert {p['id']: p['isHost'] for p in state['players']} == roles
        assert state['callerPlayerId'] == ids[1], 'Token ownership must not change'
        return state

    # First positive assertion is the old-v7 regression (403 instead of 200).
    call(path + '/players/' + ids[0], {'factionId': 'sol', 'isReady': True}, admin, 'PATCH')
    read()
    # Missing, random, and valid-but-cross-session credentials must all fail.
    for token in (None, uuid.uuid4().hex, foreign_token):
        for suffix, body, method in [
            ('/players/' + ids[0], {'isReady': True}, 'PATCH'),
            ('/players', {'name': 'Extra', 'colorHex': '#fdd835', 'unclaimed': True}, 'POST'),
            ('/players/' + ids[2], None, 'DELETE'),
            ('/players/' + ids[0] + '/strategy-cards', {'strategyCardId': 1}, 'POST'),
            ('/active-strategy', {'strategyCardId': 1}, 'POST'),
            ('/turn/advance', None, 'POST'),
            ('/players/' + ids[0] + '/pass', {'passed': True}, 'POST'),
            ('/primary/complete', {'strategyCardId': 1}, 'POST'),
            ('/players/' + ids[0] + '/secondary-done', {}, 'POST'),
            ('/speaker', {'playerId': ids[2]}, 'POST'),
            ('/players/' + ids[0] + '/status-done', {'done': True}, 'POST')]:
            call(path + suffix, body, token, method, 403)
    for pid, faction in zip(ids[1:], ['hacan', 'sardakk']):
        call(path + '/players/' + pid, {'factionId': faction, 'isReady': True}, admin, 'PATCH')
    call(path + '/players/' + ids[2], {'factionId': 'sol'}, admin, 'PATCH', 409)
    extra = call(path + '/players', {'name': 'Extra', 'colorHex': '#fdd835', 'unclaimed': True}, admin)
    extra_id = extra['playerId']
    assert not next(p for p in extra['session']['players'] if p['id'] == extra_id)['seatClaimed']
    call(path + '/players/' + extra_id, token=admin, method='DELETE')
    assert len(read()['players']) == 3
    call(path + '/players/' + ids[0], token=admin, method='DELETE', expected=400)
    call(path, {'name': 'Forbidden settings'}, admin, 'PATCH', 403)
    call(path, token=admin, method='DELETE', expected=403)
    call(path + '/turn/active', {'playerId': ids[2]}, admin, expected=403)
    call(path + '/phase/start', {}, host)
    call(path + '/players/' + ids[0], {'factionId': 'sol'}, admin, 'PATCH', 400)
    call(path + '/players', {'name': 'Late', 'colorHex': '#fdd835', 'unclaimed': True}, admin, expected=400)
    call(path + '/players/' + ids[2], token=admin, method='DELETE', expected=400)
    for card in range(1, 7):
        pid = ids[(card - 1) % 3]
        wrong = ids[card % 3]
        call(path + '/players/' + wrong + '/strategy-cards', {'strategyCardId': card}, admin, expected=400)
        call(path + '/players/' + pid + '/strategy-cards', {'strategyCardId': card}, admin)
    s = call(path + '/phase/action', {}, host)
    # Every action is sent by the same nonhost, even for host and third player.
    while not all(p['hasPassed'] for p in s['players']):
        actor = next(p for p in s['players'] if p['id'] == s['activePlayerId'])
        pid = actor['id']
        card = next(c['strategyCardId'] for c in actor['strategyCards'] if not c['isExhausted'])
        s = call(path + '/active-strategy', {'strategyCardId': card}, admin)
        nonce = s['strategyActionId']
        call(path + '/turn/advance', token=admin, expected=400)
        call(path + '/undo', {'actionId': s['undoActionId'], 'confirmed': True},
             foreign_token, expected=403)
        if pid != ids[1]:
            call(path + '/undo', {'actionId': s['undoActionId'], 'confirmed': True}, admin, expected=403)
        call(path + '/primary/complete', {'strategyCardId': card, 'actionId': str(uuid.uuid4())}, admin, expected=409)
        if card == 3:
            call(path + '/primary/complete', {'strategyCardId': card, 'actionId': nonce}, admin, expected=400)
            target = next(i for i in ids if i != s['speakerPlayerId'])
            s = call(path + '/speaker', {'playerId': target}, admin)
            assert s['speakerPlayerId'] == target and not s['speakerPending']
        s = call(path + '/primary/complete', {'strategyCardId': card, 'actionId': nonce}, admin)
        assert s['activeStrategyCardId'] is None
        for secondary in [p['id'] for p in s['players'] if p['secondaryPending']]:
            call(path + '/players/' + secondary + '/secondary-done', {'actionId': str(uuid.uuid4())}, admin, expected=409)
            s = call(path + '/players/' + secondary + '/secondary-done', {'actionId': nonce}, admin)
        assert s['secondaryCardId'] is None
        actor = next(p for p in s['players'] if p['id'] == pid)
        if any(not c['isExhausted'] for c in actor['strategyCards']):
            call(path + '/players/' + pid + '/pass', {'passed': True}, admin, expected=400)
            s = call(path + '/turn/advance', token=admin)
        else:
            s = call(path + '/players/' + pid + '/pass', {'passed': True}, admin)
        read()
    call(path + '/phase/status', {}, host)
    for _ in ids:
        s = read()
        scorer = s['statusScorerId']
        assert scorer
        wrong = next(p['id'] for p in s['players'] if p['id'] != scorer and not p['statusDone']) if sum(not p['statusDone'] for p in s['players']) > 1 else None
        if wrong:
            call(path + '/players/' + wrong + '/status-done', {'done': True}, admin, expected=400)
        call(path + '/players/' + scorer + '/status-done', {'done': True}, admin)
    assert all(p['statusDone'] for p in read()['players'])
    print(json.dumps({'shared_admin': True, 'checks': checks, 'roles_and_ownership_preserved': True,
                      'isolated_fixture_ids': sorted(created)}))


if __name__ == '__main__':
    verify()
