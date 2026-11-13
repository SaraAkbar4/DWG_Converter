import posthog from 'posthog-js/full';

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
const UI_HOST = HOST.replace('.i.posthog.com', '.posthog.com');
let ready = false;

/**
 * Starts PostHog once, in the browser, when a project key is set. Autocapture stays off.
 * The recorder ships inside the page so a blocked script cannot stop the replay.
 * The drawing canvas is included, so a replay shows the file the visitor is viewing.
 */
export function startAnalytics() {
  if (ready || !KEY || typeof window === 'undefined') return;
  ready = true;
  posthog.init(KEY, {
    api_host: '/ingest',
    ui_host: UI_HOST,
    autocapture: false,
    capture_pageview: true,
    // Anonymous visitors still get a profile, so their replay shows up in PostHog.
    person_profiles: 'always',
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask]',
      // The project leaves canvases blank. This override records the drawing.
      captureCanvas: { recordCanvas: true, canvasFps: 4, canvasQuality: '0.4' },
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
