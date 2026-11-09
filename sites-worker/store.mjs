// A revision guards the entire table aggregate, including seat assignments and its event log.
export class TableStore {
    constructor(db) {
        this.db = db;
    }

    async byCode(code) {
        return this.db.prepare("SELECT revision, document FROM ti4_tables WHERE join_code = ?").bind(code).first();
    }

    async byId(id) {
        return this.db.prepare("SELECT revision, document FROM ti4_tables WHERE id = ?").bind(id).first();
    }

    async create(game) {
        const result = await this.db.prepare(
            "INSERT INTO ti4_tables (id, join_code, document) VALUES (?, ?, ?) ON CONFLICT(join_code) DO NOTHING",
        ).bind(game.id, game.joinCode, JSON.stringify(game)).run();
        return result.meta.changes === 1;
    }

    async replace(game, revision) {
        const result = await this.db.prepare(
            "UPDATE ti4_tables SET revision = revision + 1, document = ? WHERE id = ? AND revision = ?",
        ).bind(JSON.stringify(game), game.id, revision).run();
        return result.meta.changes === 1;
    }

    async remove(id, revision) {
        const result = await this.db.prepare("DELETE FROM ti4_tables WHERE id = ? AND revision = ?")
            .bind(id, revision).run();
        return result.meta.changes === 1;
    }
}
