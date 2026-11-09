CREATE TABLE ti4_tables (
    id TEXT PRIMARY KEY,
    join_code TEXT NOT NULL UNIQUE,
    revision INTEGER NOT NULL DEFAULT 1,
    document TEXT NOT NULL
);
