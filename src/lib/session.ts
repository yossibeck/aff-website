// Session cookies signed with HMAC-SHA256 via Web Crypto (Cloudflare Workers native).
// Cookie format: <b64url(payload)>.<b64url(signature)>
// Required env var: SESSION_SECRET

const COOKIE_NAME = 'aff_session';
const MAX_AGE_SECS = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  userId: number;
  tenantId: number;
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function toB64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64Url(s: string): ArrayBuffer {
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    .buffer as ArrayBuffer;
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const data = toB64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${toB64Url(sig)}`;
}

export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;
  const data = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  try {
    const key = await getKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromB64Url(sigB64),
      new TextEncoder().encode(data)
    );
    if (!valid) return null;
    return JSON.parse(new TextDecoder().decode(fromB64Url(data))) as SessionPayload;
  } catch {
    return null;
  }
}

export function getSessionFromRequest(req: Request): string | null {
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function sessionSetHeader(token: string): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECS}`;
}

export function sessionClearHeader(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function getCookieValue(req: Request, name: string): string | null {
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
