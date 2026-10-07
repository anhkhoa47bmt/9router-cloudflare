import crypto from "node:crypto";

const CLI_AUTH_SALT = "9r-cli-auth";
let cachedRawId = null;
let cachedCliSecret = null;

async function getWorkerSeed() {
  if (typeof process === "undefined") return "";
  return process.env?.MACHINE_ID_SEED || process.env?.JWT_SECRET || "";
}

async function loadRawMachineId() {
  if (cachedRawId) return cachedRawId;

  const workerSeed = await getWorkerSeed();
  if (workerSeed) {
    cachedRawId = crypto.createHash("sha256").update(String(workerSeed)).digest("hex");
    return cachedRawId;
  }

  const [{ machineIdSync }, fsMod, pathMod, { DATA_DIR }] = await Promise.all([
    import("node-machine-id"),
    import("node:fs"),
    import("node:path"),
    import("@/lib/dataDir"),
  ]);

  const fs = fsMod.default || fsMod;
  const path = pathMod.default || pathMod;
  const machineIdFile = path.join(DATA_DIR, "machine-id");

  try {
    cachedRawId = fs.readFileSync(machineIdFile, "utf8").trim();
    if (cachedRawId) return cachedRawId;
  } catch {}

  try {
    cachedRawId = machineIdSync();
  } catch {
    cachedRawId = crypto.randomUUID();
  }

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(machineIdFile, cachedRawId, { mode: 0o600 });
  } catch {}

  return cachedRawId;
}

async function loadCliSecret() {
  if (cachedCliSecret) return cachedCliSecret;

  const workerSeed = await getWorkerSeed();
  if (workerSeed) {
    cachedCliSecret = crypto
      .createHash("sha256")
      .update(String(workerSeed) + ":cli-secret")
      .digest("hex");
    return cachedCliSecret;
  }

  const [fsMod, pathMod, { DATA_DIR }] = await Promise.all([
    import("node:fs"),
    import("node:path"),
    import("@/lib/dataDir"),
  ]);
  const fs = fsMod.default || fsMod;
  const path = pathMod.default || pathMod;
  const authDir = path.join(DATA_DIR, "auth");
  const cliSecretFile = path.join(authDir, "cli-secret");

  try {
    cachedCliSecret = fs.readFileSync(cliSecretFile, "utf8").trim();
    if (cachedCliSecret) return cachedCliSecret;
  } catch {}

  cachedCliSecret = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(cliSecretFile, cachedCliSecret, { mode: 0o600 });
  } catch {}

  return cachedCliSecret;
}

async function getRuntimeSalt() {
  const value = typeof process !== "undefined" ? process.env?.MACHINE_ID_SALT : undefined;
  return value || "endpoint-proxy-salt";
}

export async function getConsistentMachineId(salt = null) {
  const saltValue = salt || await getRuntimeSalt();
  const raw = await loadRawMachineId();
  const extra = saltValue === CLI_AUTH_SALT ? await loadCliSecret() : "";
  return crypto
    .createHash("sha256")
    .update(raw + saltValue + extra)
    .digest("hex")
    .substring(0, 16);
}

export async function getRawMachineId() {
  return await loadRawMachineId();
}

export function isBrowser() {
  return typeof window !== "undefined";
}
