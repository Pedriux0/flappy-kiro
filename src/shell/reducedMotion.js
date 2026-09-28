// Reduced-motion tracker (design: "Reduced-motion query unavailable", R20.10).
// Reports whether `(prefers-reduced-motion: reduce)` currently matches and
// follows OS changes via the media query's `change` event, so toggling the
// setting takes effect on the next frame. Never throws: any failure (missing
// matchMedia, odd MediaQueryList, listener errors) degrades to `false`.

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * @param {((query: string) => MediaQueryList) | undefined | null} [matchMedia]
 *   Defaults to `globalThis.matchMedia`. Always invoked with `this = globalThis`
 *   so an unbound `window.matchMedia` does not throw "Illegal invocation".
 * @returns {{ get(): boolean, dispose(): void }}
 */
export function createReducedMotion(matchMedia = globalThis.matchMedia) {
  let reduced = false;
  let mql = null;
  let detach = () => {};

  const onChange = (event) => {
    try {
      const matches = event && typeof event.matches === 'boolean' ? event.matches : mql && mql.matches;
      reduced = matches === true;
    } catch {
      reduced = false;
    }
  };

  if (typeof matchMedia === 'function') {
    try {
      mql = matchMedia.call(globalThis, REDUCED_MOTION_QUERY);
    } catch {
      mql = null;
    }
  }

  if (mql && typeof mql === 'object') {
    try {
      reduced = mql.matches === true;
    } catch {
      reduced = false;
    }
    try {
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onChange);
        detach = () => mql.removeEventListener('change', onChange);
      } else if (typeof mql.addListener === 'function') {
        // Older Safari (< 14) only supports the deprecated listener API.
        mql.addListener(onChange);
        detach = () => mql.removeListener(onChange);
      }
    } catch {
      detach = () => {};
    }
  }

  return {
    /** Current reduced-motion preference; `false` when unknown. */
    get() {
      return reduced;
    },
    /** Stop listening for changes. Safe to call more than once. */
    dispose() {
      try {
        detach();
      } catch {
        /* ignore */
      }
      detach = () => {};
    },
  };
}
