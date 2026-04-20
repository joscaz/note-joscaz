import { useEffect, useState } from 'react';

/**
 * Lightweight hash-based router. Avoids pulling in react-router for the one
 * extra page we need. Returns the path portion of `location.hash` (without
 * the leading `#`). Example:
 *   `#/training`  → `/training`
 *   `` (empty)    → `/`
 */
export function useHashRoute(): string {
  const [route, setRoute] = useState<string>(() => getRoute());

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

function getRoute(): string {
  const h = window.location.hash.replace(/^#/, '');
  if (!h || h === '/') return '/';
  return h.startsWith('/') ? h : `/${h}`;
}

export function navigate(path: string): void {
  const target = path.startsWith('/') ? path : `/${path}`;
  if (window.location.hash === `#${target}`) return;
  window.location.hash = `#${target}`;
  window.scrollTo({ top: 0, behavior: 'auto' });
}
