// Cloudflare D1 adapter.
// D1 uses SQLite semantics, but its API is asynchronous. Cloudflare-specific
// repositories should await run/get/all/exec/transaction results.
export function createCloudflareD1Adapter(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("[DB] Cloudflare D1 binding 'DB' is unavailable");
  }

  const bind = (stmt, params = []) =>
    Array.isArray(params) && params.length ? stmt.bind(...params) : stmt;

  return {
    driver: "cloudflare-d1",

    async run(sql, params = []) {
      const result = await bind(db.prepare(sql), params).run();
      return {
        changes: Number(result?.meta?.changes ?? 0),
        lastInsertRowid: Number(result?.meta?.last_row_id ?? 0),
      };
    },

    async get(sql, params = []) {
      const row = await bind(db.prepare(sql), params).first();
      return row ?? undefined;
    },

    async all(sql, params = []) {
      const result = await bind(db.prepare(sql), params).all();
      return result?.results ?? [];
    },

    async exec(sql) {
      return db.exec(sql);
    },

    // D1 does not expose the synchronous callback transaction primitive used by
    // better-sqlite3. Await the callback so Cloudflare repositories can migrate
    // incrementally while preserving the adapter surface.
    async transaction(fn) {
      return await fn();
    },

    async close() {},
    raw: db,
  };
}
