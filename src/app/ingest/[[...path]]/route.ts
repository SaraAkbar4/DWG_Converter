import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const INGEST = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com').replace(/\/$/, '');
const ASSETS = INGEST.replace('.i.posthog.com', '-assets.i.posthog.com');
/** PostHog resets the connection when a recording or event is posted without the trailing slash. */
const NEEDS_SLASH = new Set(['/s', '/e', '/i/v0/e', '/flags', '/decide']);

const drop = (headers: Headers, names: string[]) => {
  for (const name of names) headers.delete(name);
};

/** Forwards /ingest to PostHog. Next's rewrite proxy drops the trailing slash and the session never arrives. */
async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  let path = url.pathname.replace(/^\/ingest/, '') || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (NEEDS_SLASH.has(path)) path += '/';
  const host = path.startsWith('/static/') || path.startsWith('/array/') ? ASSETS : INGEST;
  const headers = new Headers(request.headers);
  drop(headers, ['host', 'connection', 'content-length']);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(`${host}${path}${url.search}`, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
    });
  } catch (error) {
    console.error('[ingest] PostHog request failed', path, error);
    return NextResponse.json({ error: 'analytics unavailable' }, { status: 502 });
  }
  const outgoing = new Headers(upstream.headers);
  drop(outgoing, ['content-encoding', 'content-length', 'transfer-encoding']);
  return new NextResponse(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: outgoing });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
