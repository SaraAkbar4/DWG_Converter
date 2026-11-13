import { NextResponse } from 'next/server';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const recent = new Map<string, number[]>();

/** The only endpoint that receives user data. It never receives drawing files. */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  recent.set(ip, [...hits, now]);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  // Honeypot: real visitors never fill the hidden "website" field.
  if (body.website) return NextResponse.json({ ok: true });

  const field = (key: string, max: number) => String(body[key] ?? '').trim().slice(0, max);
  const lead = {
    name: field('name', 120),
    email: field('email', 200),
    company: field('company', 160),
    role: field('role', 120),
    message: field('message', 1000),
    intent: field('intent', 40),
    submittedAt: new Date(now).toISOString(),
  };
  if (!lead.name || !lead.company || !EMAIL_RE.test(lead.email) || body.consent !== true) {
    return NextResponse.json({ error: 'Please fill in the required fields.' }, { status: 400 });
  }

  const webhook = process.env.LEAD_WEBHOOK_URL;
  if (!webhook) {
    console.info('[lead] LEAD_WEBHOOK_URL is not set; lead not delivered:', lead);
    return NextResponse.json({ ok: true });
  }
  const delivered = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(lead),
  }).catch(() => null);
  if (!delivered?.ok) return NextResponse.json({ error: 'Could not send. Please try again.' }, { status: 502 });
  return NextResponse.json({ ok: true });
}
