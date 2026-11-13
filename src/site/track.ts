type Plausible = (event: string, options?: { props: Record<string, string | number> }) => void;

/** Sends an analytics event when a Plausible script is on the page; otherwise does nothing. */
export function track(event: string, props: Record<string, string | number> = {}) {
  (window as Window & { plausible?: Plausible }).plausible?.(event, { props });
}
