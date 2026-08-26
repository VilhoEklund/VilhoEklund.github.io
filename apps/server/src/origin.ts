/** CORS / origin helpers shared by the worker routes. */

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface OriginPolicy {
  /** True when every origin is allowed (dev convenience only). */
  allowAll: boolean;
  origins: Set<string>;
}

export function originPolicyFromEnv(raw: string | undefined): OriginPolicy {
  const origins = parseAllowedOrigins(raw);
  return { allowAll: origins.includes('*'), origins: new Set(origins) };
}

/**
 * Browser-supplied Origin check. Non-browser clients may omit the header;
 * those cannot hold cookies but admin endpoints still require a bearer token.
 */
export function isOriginAllowed(policy: OriginPolicy, origin: string | null): boolean {
  if (policy.allowAll) return true;
  if (origin === null) return true; // non-browser client; sensitive routes have their own auth
  return policy.origins.has(origin);
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
  if (origin) {
    h['Access-Control-Allow-Origin'] = origin;
  }
  return h;
}

/** Timing-safe-ish token comparison for admin endpoints. */
export function tokensMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) {
    // Still burn comparable time to avoid trivial length oracles.
    let x = 0;
    for (let i = 0; i < b.length; i++) x |= b.charCodeAt(i);
    return x === -1 && false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
