import { useEffect, useState } from 'preact/hooks';
import { subscribe, type BgStatus } from '../background';

const MESSAGES = {
  offline: 'You’re offline — training works as normal. Games sync when you’re back.',
  'not-found': 'chess.com doesn’t know that username. Check it in Settings.',
  'rate-limited': 'chess.com is busy right now. Your games will sync later.',
  server: 'chess.com didn’t answer. Your games will sync later.',
};

export function SyncBanner() {
  const [s, setS] = useState<BgStatus | null>(null);
  const [hidden, setHidden] = useState<string | null>(null);
  useEffect(() => subscribe((x) => { if (x.syncing) setHidden(null); setS(x); }), []);
  if (!s?.syncError || hidden === s.syncError) return null;
  return (
    <div class="banner" role="status">
      <span>{MESSAGES[s.syncError]}</span>
      <button class="btn ghost small icon-btn" aria-label="Dismiss" onClick={() => setHidden(s.syncError!)}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
      </button>
    </div>
  );
}
