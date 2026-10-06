import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

function rowToPool(row) {
  if (!row) return null;
  const extra = parseJson(row.data, {});
  return {
    ...extra,
    id: row.id,
    isActive: row.isActive === 1 || row.isActive === true,
    testStatus: row.testStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function poolToRow(p) {
  const { id, isActive, testStatus, createdAt, updatedAt, ...rest } = p;
  return {
    id,
    isActive: isActive === false ? 0 : 1,
    testStatus: testStatus ?? null,
    data: stringifyJson(rest),
    createdAt,
    updatedAt,
  };
}

function upsert(db, p) {
  const r = poolToRow(p);
  db.run(
    `INSERT INTO proxyPools(id, isActive, testStatus, data, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       isActive=excluded.isActive, testStatus=excluded.testStatus,
       data=excluded.data, updatedAt=excluded.updatedAt`,
    [r.id, r.isActive, r.testStatus, r.data, r.createdAt, r.updatedAt]
  );
}

export async function getProxyPools(filter = {}) {
  const db = await getAdapter();
  const where = [];
  const params = [];
  if (filter.isActive !== undefined) { where.push("isActive = ?"); params.push(filter.isActive ? 1 : 0); }
  if (filter.testStatus) { where.push("testStatus = ?"); params.push(filter.testStatus); }
  const sql = `SELECT * FROM proxyPools${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`;
  const list = (await db.all(sql, params)).map(rowToPool);
  list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  return list;
}

export async function getProxyPoolById(id) {
  const db = await getAdapter();
  return rowToPool(await db.get(`SELECT * FROM proxyPools WHERE id = ?`, [id]));
}

export async function createProxyPool(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const pool = {
    id: data.id || uuidv4(),
    name: data.name,
    proxyUrl: data.proxyUrl,
    noProxy: data.noProxy || "",
    type: data.type || "http",
    isActive: data.isActive !== undefined ? data.isActive : true,
    strictProxy: data.strictProxy === true,
    testStatus: data.testStatus || "unknown",
    lastTestedAt: data.lastTestedAt || null,
    lastError: data.lastError || null,
    createdAt: now,
    updatedAt: now,
  };
  if (db.driver === "cloudflare-d1") {
    const r = poolToRow(pool);
    await db.run(
      `INSERT INTO proxyPools(id, isActive, testStatus, data, createdAt, updatedAt)\n       VALUES(?, ?, ?, ?, ?, ?)\n       ON CONFLICT(id) DO UPDATE SET\n         isActive=excluded.isActive, testStatus=excluded.testStatus,\n         data=excluded.data, updatedAt=excluded.updatedAt`,
      [r.id, r.isActive, r.testStatus, r.data, r.createdAt, r.updatedAt]
    );
  } else {
    upsert(db, pool);
  }
  return pool;
}

export async function updateProxyPool(id, data) {
  const db = await getAdapter();
  if (db.driver === "cloudflare-d1") {
    const row = await db.get(`SELECT * FROM proxyPools WHERE id = ?`, [id]);
    if (!row) return null;
    const merged = { ...rowToPool(row), ...data, updatedAt: new Date().toISOString() };
    const r = poolToRow(merged);
    await db.run(
      `INSERT INTO proxyPools(id, isActive, testStatus, data, createdAt, updatedAt)
       VALUES(?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         isActive=excluded.isActive, testStatus=excluded.testStatus,
         data=excluded.data, updatedAt=excluded.updatedAt`,
      [r.id, r.isActive, r.testStatus, r.data, r.createdAt, r.updatedAt]
    );
    return merged;
  }

  let result = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM proxyPools WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToPool(row), ...data, updatedAt: new Date().toISOString() };
    upsert(db, merged);
    result = merged;
  });
  return result;
}

export async function deleteProxyPool(id) {
  const db = await getAdapter();
  if (db.driver === "cloudflare-d1") {
    const row = await db.get(`SELECT * FROM proxyPools WHERE id = ?`, [id]);
    if (!row) return null;
    const removed = rowToPool(row);
    await db.run(`DELETE FROM proxyPools WHERE id = ?`, [id]);
    return removed;
  }

  let removed = null;
  db.transaction(() => {
    const row = db.get(`SELECT * FROM proxyPools WHERE id = ?`, [id]);
    if (!row) return;
    removed = rowToPool(row);
    db.run(`DELETE FROM proxyPools WHERE id = ?`, [id]);
  });
  return removed;
}
