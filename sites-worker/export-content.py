"""Export compact table reference data from the repository's master database."""
import json
from pathlib import Path
import sqlite3
import sys

db = sqlite3.connect("file:Ti4Companion.ApiService/ti4master.db?mode=ro", uri=True)
db.row_factory = sqlite3.Row


def rows(table, key):
    result = {}
    for row in db.execute(f"SELECT * FROM {table} ORDER BY Version, Id"):
        item = {name[0].lower() + name[1:]: row[name] for name in row.keys()}
        item["id"] = item.pop(key)
        result[item["id"]] = item
    return list(result.values())


factions = rows("Factions", "slug")
for faction in factions:
    faction["startingTechnologies"] = []
    faction["preferredColors"] = []

cards = sorted(rows("StrategyCards", "number"), key=lambda row: row["initiative"])
bundle = {name: [] for name in (
    "objectives", "technologies", "agendas", "planets", "units", "factionAbilities",
    "leaders", "breakthroughs", "startingUnits", "typeValues", "promissoryNotes",
    "actionCards", "explorations", "relics", "galacticEvents", "factionCards", "systemTiles",
)}
Path(sys.argv[1]).write_text(json.dumps(dict(bundle, factions=factions, strategyCards=cards)), encoding="utf-8")
