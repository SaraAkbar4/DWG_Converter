import posthog from 'posthog-js';

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
let ready = false;

/**
 * Starts PostHog once, in the browser, when a project key is set. Autocapture stays off and
 * replays block every canvas: a visitor's drawing must never end up in a recording.
 */
export function startAnalytics() {
  if (ready || !KEY || typeof window === 'undefined') return;
  ready = true;
  posthog.init(KEY, {
    api_host: '/ingest',
    ui_host: HOST,
    autocapture: false,
    capture_pageview: true,
    // Replays show the page chrome only: every canvas is blanked and every input masked,
    // so a visitor's drawing is never recorded.
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask]',
      blockSelector: 'canvas, .ph-no-capture',
    },
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
  });
}

type Plausible = (event: string, options?: { props: Record<string, string | number> }) => void;

/** Sends an event to PostHog (and Plausible when its script is on the page). Never includes drawing content. */
export function track(event: string, props: Record<string, string | number> = {}) {
  if (ready) posthog.capture(event, props);
  (window as Window & { plausible?: Plausible }).plausible?.(event, { props });
}
