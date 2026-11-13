const KEY = 'kodifly-reloaded';

/**
 * Wraps a lazy import. After a deploy, a tab opened before it asks for script files that no longer
 * exist; instead of showing nothing, the page reloads once and gets the new build.
 */
export function fresh<T>(load: () => Promise<T>, fallback: T): () => Promise<T> {
  return () =>
    load().then(
      (value) => {
        sessionStorage.removeItem(KEY);
        return value;
      },
      (error: unknown) => {
        if (sessionStorage.getItem(KEY)) throw error;
        sessionStorage.setItem(KEY, '1');
        location.reload();
        return fallback;
      },
    );
}
