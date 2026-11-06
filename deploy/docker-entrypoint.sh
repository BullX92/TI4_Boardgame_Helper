#!/bin/sh
set -eu

if [ ! -w /data ]; then
    echo 'The /data volume must be writable by UID 1654 (the .NET app user).' >&2
    exit 1
fi

# Seed reference content once. Existing content and game sessions survive image updates.
if [ ! -e /data/ti4master.db ]; then
    cp /app/seed/ti4master.db /data/ti4master.db
fi

exec dotnet /app/Ti4Companion.ApiService.dll "$@"
