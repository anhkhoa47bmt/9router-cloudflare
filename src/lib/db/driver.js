async function tryCloudflareD1() {
  try {
    // Only resolves in the Cloudflare Workers runtime. Keeping this dynamic
    // preserves the existing Node/Bun paths for local and Docker installs.
    const { env } = await import("cloudflare:workers");
    if (!env?.DB) return null;
    const { createCloudflareD1Adapter } = await import("./adapters/cloudflareD1Adapter.js");
    return createCloudflareD1Adapter(env.DB);
  } catch {
    return null;
  }
}

// Use global to survive Next.js dev hot-reload (module state resets on reload)
if (!globalThis._dbAdapter) globalThis._dbAdapter = { instance: null, initPromise: null, logged: false };
const state = globalThis._dbAdapter;

async function tryBunSqlite(dataFile) {
  // Bun runtime only — built-in, no install needed
  if (!process.versions.bun) return null;
  try {
    const { createBunSqliteAdapter } = await import("./adapters/bunSqliteAdapter.js");
    return await createBunSqliteAdapter(dataFile);
  } catch (e) {
    console.warn(`[DB] bun:sqlite unavailable: ${e.message}`);
    return null;
  }
}

async function tryBetterSqlite(dataFile) {
  // Skip on Bun — better-sqlite3 native bindings unsupported
  if (process.versions.bun) return null;
  // Skip on Node >= 24: the native addon SIGSEGVs on load there, which is a
  // process-level crash the try/catch below cannot recover from. node:sqlite covers it.
  const [nodeMajor] = process.versions.node.split(".").map(Number);
  if (nodeMajor >= 24) return null;
  try {
    const { createBetterSqliteAdapter } = await import("./adapters/betterSqliteAdapter.js");
    return createBetterSqliteAdapter(dataFile);
  } catch (e) {
    console.warn(`[DB] better-sqlite3 unavailable: ${e.message}`);
    return null;
  }
}

async function tryNodeSqlite(dataFile) {
  // Built-in since Node 22.5.0 — no install needed. Skip under Bun (no node:sqlite).
  if (process.versions.bun) return null;
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 22 || (maj === 22 && min < 5)) return null;
  try {
    const { createNodeSqliteAdapter } = await import("./adapters/nodeSqliteAdapter.js");
    return await createNodeSqliteAdapter(dataFile);
  } catch (e) {
    console.warn(`[DB] node:sqlite unavailable: ${e.message}`);
    return null;
  }
}

async function trySqlJs(dataFile) {
  try {
    const { createSqlJsAdapter } = await import("./adapters/sqljsAdapter.js");
    return await createSqlJsAdapter(dataFile);
  } catch (e) {
    console.warn(`[DB] sql.js unavailable: ${e.message}`);
    return null;
  }
}

async function initAdapter() {
  // Cloudflare Workers has no persistent local filesystem. Prefer D1 before
  // touching the file-backed SQLite paths used by Node/Bun.
  const cloudflareAdapter = await tryCloudflareD1();
  if (cloudflareAdapter) {
    const { ensureCloudflareSchema } = await import("./cloudflareBootstrap.js");
    await ensureCloudflareSchema(cloudflareAdapter);
    if (!state.logged) {
      console.log("[DB] Driver: cloudflare-d1");
      state.logged = true;
    }
    return cloudflareAdapter;
  }

  // Load Node/Bun filesystem paths only after the Cloudflare D1 path has been
  // ruled out. This keeps node:fs/node:path out of the Workers module graph.
  const { ensureDirs, DATA_FILE } = await import("./paths.js");
  ensureDirs();

  // Order per runtime:
  //   Bun:  bun:sqlite → sql.js
  //   Node: better-sqlite3 → node:sqlite (≥22.5) → sql.js
  let adapter = await tryBunSqlite(DATA_FILE);
  if (!adapter) adapter = await tryBetterSqlite(DATA_FILE);
  if (!adapter) adapter = await tryNodeSqlite(DATA_FILE);
  if (!adapter) adapter = await trySqlJs(DATA_FILE);
  if (!adapter) throw new Error("[DB] No SQLite driver available (bun/better/node/sql.js all failed)");

  if (!state.logged) {
    console.log(`[DB] Driver: ${adapter.driver} | file: ${DATA_FILE}`);
    state.logged = true;
  }

  const { runMigrationOnce } = await import("./migrate.js");
  await runMigrationOnce(adapter);
  return adapter;
}

export async function getAdapter() {
  if (state.instance) return state.instance;
  if (!state.initPromise) state.initPromise = initAdapter().then((a) => { state.instance = a; return a; });
  return state.initPromise;
}

export function getAdapterSync() {
  if (!state.instance) throw new Error("[DB] adapter not initialized — await getAdapter() first");
  return state.instance;
}
