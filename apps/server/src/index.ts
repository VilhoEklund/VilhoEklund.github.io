import { DEFAULT_WORLD_ID, type Env } from './env.ts';
import { corsHeaders, isOriginAllowed, originPolicyFromEnv } from './origin.ts';
import { EternalWorld } from './do.ts';

export { EternalWorld };

/** Routes that require the admin bearer token before reaching the DO. */
const ADMIN_PATHS = new Set(['/export', '/import', '/admin/ban', '/admin/unban']);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const policy = originPolicyFromEnv(env.ALLOWED_ORIGINS);

    if (request.method === 'OPTIONS') {
      if (!isOriginAllowed(policy, origin)) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: { ...corsHeaders(origin), 'Access-Control-Allow-Headers': 'Authorization,Content-Type' },
      });
    }

    // Public health endpoint served at the edge (no DO round-trip).
    if (url.pathname === '/health') {
      return withCors(jsonResponse({ ok: true, service: 'eternal-blocks-server' }), origin);
    }

    if (!isOriginAllowed(policy, origin)) {
      return withCors(
        jsonResponse({ ok: false, error: 'origin not allowed' }, 403),
        origin,
      );
    }

    if (url.pathname === '/') {
      return withCors(
        jsonResponse({
          ok: true,
          service: 'eternal-blocks-server',
          endpoints: ['/ws (websocket)', '/stats', '/health'],
          note: 'This is the Eternal Blocks game server. Clients connect via WebSocket to /ws.',
        }),
        origin,
      );
    }

    // Admin routes: bearer token gate at the edge AND inside the DO.
    if (ADMIN_PATHS.has(url.pathname)) {
      const header = request.headers.get('Authorization') ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      const ok = token.length > 0 && token === (env.ADMIN_TOKEN ?? '');
      if (!ok) return withCors(jsonResponse({ ok: false, error: 'unauthorized' }, 401), origin);
    }

    // Everything else is handled by the single world Durable Object.
    const id = env.ETERNAL_WORLD.idFromName(env.WORLD_ID || DEFAULT_WORLD_ID);
    const stub = env.ETERNAL_WORLD.get(id) as { fetch(req: Request): Promise<Response> };
    const response = await stub.fetch(new Request(new URL(url.pathname + url.search, request.url), request));

    if (url.pathname === '/ws') return response; // 101 upgrade passes through untouched
    return withCors(response, origin);
  },
} satisfies ExportedHandler<Env>;

function withCors(res: Response, origin: string | null): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(corsHeaders(origin))) out.headers.set(k, v);
  return out;
}

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
