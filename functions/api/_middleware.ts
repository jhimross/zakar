// Protects every /api route. Fails closed: if Cloudflare Access isn't configured,
// requests are rejected unless ALLOW_UNAUTHENTICATED is set (local dev only).
import { createRemoteJWKSet, jwtVerify } from 'jose';

interface Env {
  ACCESS_TEAM_DOMAIN?: string; // e.g. "yourteam.cloudflareaccess.com"
  ACCESS_AUD?: string;         // Application Audience (AUD) tag from Access
  ALLOWED_EMAILS?: string;     // optional, comma separated
  ALLOW_UNAUTHENTICATED?: string;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksDomain = '';

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json' } });

function cookie(req: Request, name: string): string | null {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { env, request } = ctx;
  const team = (env.ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

  if (team && env.ACCESS_AUD) {
    const token = request.headers.get('Cf-Access-Jwt-Assertion') || cookie(request, 'CF_Authorization');
    if (!token) return json(401, 'Not signed in');
    try {
      if (!jwks || jwksDomain !== team) {
        jwks = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
        jwksDomain = team;
      }
      const { payload } = await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: env.ACCESS_AUD });
      const allowed = (env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      const email = String(payload.email || '').toLowerCase();
      if (allowed.length && !allowed.includes(email)) return json(403, 'Not allowed');
    } catch {
      return json(401, 'Invalid session');
    }
    return ctx.next();
  }

  if (env.ALLOW_UNAUTHENTICATED === 'true') return ctx.next();
  return json(503, 'Auth not configured: set ACCESS_TEAM_DOMAIN and ACCESS_AUD (see README)');
};
