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
  useEffect(() => subscribe(setS), []);
  if (!s?.syncError || hidden === s.syncError) return null;
  return (
    <div class="banner" role="status">
      <span>{MESSAGES[s.syncError]}</span>
      <button class="btn ghost small" aria-label="Dismiss" onClick={() => setHidden(s.syncError!)}>✕</button>
    </div>
  );
}
