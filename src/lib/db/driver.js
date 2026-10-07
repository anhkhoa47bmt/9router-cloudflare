import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createCloudflareD1Adapter } from "./adapters/cloudflareD1Adapter.js";
import { ensureCloudflareSchema } from "./cloudflareBootstrap.js";

if (!globalThis._dbAdapter) {
  globalThis._dbAdapter = { instance: null, initPromise: null, logged: false };
}
const state = globalThis._dbAdapter;

async function initAdapter() {
  const { env } = await getCloudflareContext({ async: true });
  if (!env?.DB) {
    throw new Error("[DB] Cloudflare D1 binding 'DB' is unavailable");
  }

  const adapter = createCloudflareD1Adapter(env.DB);
  await ensureCloudflareSchema(adapter);

  if (!state.logged) {
    console.log("[DB] Driver: cloudflare-d1");
    state.logged = true;
  }

  return adapter;
}

export async function getAdapter() {
  if (state.instance) return state.instance;
  if (!state.initPromise) {
    state.initPromise = initAdapter().then((adapter) => {
      state.instance = adapter;
      return adapter;
    }).catch((error) => {
      state.initPromise = null;
      throw error;
    });
  }
  return state.initPromise;
}

export function getAdapterSync() {
  if (!state.instance) {
    throw new Error("[DB] adapter not initialized — await getAdapter() first");
  }
  return state.instance;
}
