import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { getSettings } from "@/lib/localDb";

const DEFAULT_PASSWORD = "123456";
const SESSION_MAX_AGE_SEC = 24 * 60 * 60;

let cachedSecret = null;

async function getRuntimeSecret() {
  if (cachedSecret) return cachedSecret;

  let secret = typeof process !== "undefined" ? process.env?.JWT_SECRET : undefined;

  if (!secret) {
    try {
      const { env } = await import("cloudflare:workers");
      secret = env?.JWT_SECRET;
    } catch {}
  }

  if (!secret) {
    try {
      const [{ default: fs }, { default: path }, { default: crypto }, { DATA_DIR }] = await Promise.all([
        import("node:fs"),
        import("node:path"),
        import("node:crypto"),
        import("@/lib/dataDir"),
      ]);
      const file = path.join(DATA_DIR, "jwt-secret");
      try {
        secret = fs.readFileSync(file, "utf8").trim();
      } catch {}
      if (!secret) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        secret = crypto.randomBytes(32).toString("hex");
        fs.writeFileSync(file, secret, { mode: 0o600 });
      }
    } catch {}
  }

  if (!secret) {
    throw new Error("JWT_SECRET is required in this runtime");
  }

  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
}

export function shouldUseSecureCookie(request) {
  const forceSecureCookie = typeof process !== "undefined" && process.env?.AUTH_COOKIE_SECURE === "true";
  const forwardedProto = request?.headers?.get?.("x-forwarded-proto");
  const isHttpsRequest = forwardedProto === "https";
  return forceSecureCookie || isHttpsRequest;
}

export async function createDashboardAuthToken(claims = {}) {
  const secret = await getRuntimeSecret();
  return new SignJWT({ authenticated: true, ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
}

export async function verifyDashboardAuthToken(token) {
  if (!token) return false;
  try {
    const secret = await getRuntimeSecret();
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function getDashboardAuthSession(token) {
  if (!token) return null;
  try {
    const secret = await getRuntimeSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}

export async function setDashboardAuthCookie(cookieStore, request, claims = {}) {
  const token = await createDashboardAuthToken(claims);
  cookieStore.set("auth_token", token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(request),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

export function clearDashboardAuthCookie(cookieStore) {
  cookieStore.delete("auth_token");
}

export async function verifyDashboardPassword(password) {
  if (typeof password !== "string" || !password) return false;
  const settings = await getSettings();
  const storedHash = settings?.password;
  if (storedHash) return bcrypt.compare(password, storedHash);

  let initialPassword = typeof process !== "undefined" ? process.env?.INITIAL_PASSWORD : undefined;
  if (!initialPassword) {
    try {
      const { env } = await import("cloudflare:workers");
      initialPassword = env?.INITIAL_PASSWORD;
    } catch {}
  }

  return password === (initialPassword || DEFAULT_PASSWORD);
}
