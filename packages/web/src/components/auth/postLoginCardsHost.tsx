import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PostLoginCards } from './PostLoginCards';

/**
 * App-level host for the post-login card ritual.
 *
 * Why not local state inside <LoginPage>? The moment `login()` resolves, the
 * auth store's token re-renders <AuthRedirect>, which swaps the route and
 * unmounts LoginPage in the same commit — any overlay state it owned died
 * with it. This host is mounted ONCE in main.tsx, outside the router, so it
 * survives any navigation.
 *
 * Contract (never blocks access):
 *  - `requestPostLoginCards()` fires a custom event; the host renders the
 *    overlay and calls `onDone` when the ritual completes.
 *  - If the overlay errors, React unmounts the root and we navigate
 *    immediately via `onDone`.
 *  - The overlay itself has a watchdog timeout; if JS is starved or the
 *    component never finishes, the fallback timer navigates.
 */

interface CardsRequest {
  displayName: string;
  fast: boolean;
  /** Navigate into the app. Called exactly once. */
  onDone: () => void;
}

export const POST_LOGIN_CARDS_EVENT = 'vertex:post-login-cards';

let hostRoot: Root | null = null;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

function ensureHost(): Root {
  if (hostRoot) return hostRoot;
  let el = document.getElementById('post-login-cards-host');
  if (!el) {
    el = document.createElement('div');
    el.id = 'post-login-cards-host';
    document.body.appendChild(el);
  }
  hostRoot = createRoot(el);
  return hostRoot;
}

function finish(request: CardsRequest, unmount: () => void) {
  if (fallbackTimer) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  try {
    unmount();
  } catch {
    /* root may already be gone */
  }
  request.onDone();
}

/** Called from LoginPage after a successful `login()`. */
export function requestPostLoginCards(request: CardsRequest): void {
  try {
    const root = ensureHost();
    // Safety net: if the overlay never calls onDone (frozen tab, crashed
    // animation), navigate anyway after 5s.
    fallbackTimer = setTimeout(() => {
      try {
        root.unmount();
      } catch {
        /* noop */
      }
      hostRoot = null;
      request.onDone();
    }, 5000);

    root.render(
      <PostLoginCards
        displayName={request.displayName}
        fast={request.fast}
        onDone={() => finish(request, () => root.unmount())}
      />,
    );
  } catch {
    // Any failure → straight into the app.
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    request.onDone();
  }
}
