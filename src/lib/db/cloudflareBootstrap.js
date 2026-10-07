import { TABLES, SCHEMA_VERSION, buildCreateTableSql } from "./schema.js";

export async function ensureCloudflareSchema(adapter) {
  for (const [name, def] of Object.entries(TABLES)) {
    await adapter.exec(buildCreateTableSql(name, def));
    for (const indexSql of def.indexes || []) {
      await adapter.exec(indexSql);
    }
  }

  await adapter.run(
    `INSERT INTO _meta(key, value) VALUES('schemaVersion', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(SCHEMA_VERSION)]
  );
}
