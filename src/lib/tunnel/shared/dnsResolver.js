// Cloudflare Workers resolves upstream DNS as part of fetch().
// Node's Resolver.setServers() is not implemented in Workers, so tunnel health
// checks must not install custom resolvers in this deployment target.
export async function resolveDns(hostname, timeoutMs) {
  return Boolean(hostname);
}
