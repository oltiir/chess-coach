import { useEffect, useState } from 'preact/hooks';
import { syncAndAnalyse, subscribe, type BgStatus } from '../background';
import { Toggle } from '../bot/PlayScreen';
import { kvGet } from '../store/db';
import { exportAll, getSettings, importMerge, saveSettings, type ExportFile } from '../store/exportImport';
import type { Settings } from '../store/types';

export function SettingsScreen() {
  const [s, setS] = useState<Settings | null>(null);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [lastSync, setLastSync] = useState<number | undefined>();
  const [bg, setBg] = useState<BgStatus | null>(null);

  const refresh = async () => {
    const x = await getSettings();
    setS(x); setName(x.username);
    setPersisted((await kvGet<boolean>('persisted')) ?? false);
    setLastSync(await kvGet<number>('last-sync'));
  };
  useEffect(() => { void refresh(); return subscribe((b) => { setBg(b); if (!b.syncing) void kvGet<number>('last-sync').then(setLastSync); }); }, []);
  if (!s) return null;

  const update = async (patch: Partial<Settings>) => { await saveSettings(patch); setS({ ...s, ...patch }); };

  const exportFile = async () => {
    const blob = new Blob([JSON.stringify(await exportAll())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chess-coach-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const { added } = await importMerge(JSON.parse(await f.text()) as ExportFile);
      setMsg(`Backup imported: ${added} new item${added === 1 ? '' : 's'}`);
      await refresh();
    } catch (e) {
      setMsg(e instanceof SyntaxError ? 'That file isn’t a Chess Coach backup.' : (e as Error).message);
    }
  };

  return (
    <div class="stack settings">
      <section class="card stack">
        <h2>chess.com</h2>
        <label class="field-label" for="username">chess.com username</label>
        <div class="row">
          <input id="username" class="input" value={name} autocomplete="off" autocapitalize="off" spellcheck={false}
            onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          <button class="btn" disabled={!name.trim() || name.trim() === s.username} onClick={async () => { await update({ username: name.trim() }); void syncAndAnalyse(); }}>Save</button>
        </div>
        <div class="row between">
          <span class="dim">{bg?.syncing ? 'Syncing…' : lastSync ? `Last synced ${new Date(lastSync).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Not synced yet'}</span>
          <button class="btn secondary small" disabled={bg?.syncing} onClick={() => void syncAndAnalyse()}>Sync now</button>
        </div>
      </section>

      <section class="card stack">
        <h2>Training</h2>
        <div class="field">
          <div><div class="field-label">Blunder alarm</div><div class="dim field-hint">Default for new practice games</div></div>
          <Toggle checked={s.alarm} onChange={(v) => void update({ alarm: v })} label="Blunder alarm default" />
        </div>
        <div class="field">
          <div><div class="field-label">Bot strength</div><div class="dim field-hint">{s.botElo ? 'Fixed' : 'Matches your rapid rating'}</div></div>
          <div class="stepper">
            <button class="btn secondary small" aria-label="Weaker bot" onClick={() => void update({ botElo: Math.max(600, (s.botElo ?? 600) - 50) })}>−</button>
            <span class="stepper-value">{s.botElo ?? 'Auto'}</span>
            <button class="btn secondary small" aria-label="Stronger bot" onClick={() => void update({ botElo: Math.min(2000, (s.botElo ?? 600) + 50) })}>+</button>
          </div>
        </div>
        {s.botElo && <button class="btn ghost small" onClick={() => void update({ botElo: null })}>Back to auto</button>}
      </section>

      <section class="card stack">
        <h2>Your data</h2>
        <p class="dim" style="margin:0">Everything lives on this device. A backup moves it to another device or keeps it safe.</p>
        <div class="row between">
          <span>{persisted ? 'Protected' : 'Not protected — export a backup regularly'}</span>
        </div>
        <div class="row">
          <button class="btn secondary" style="flex:1" onClick={() => void exportFile()}>Export backup</button>
          <label class="btn secondary" style="flex:1">
            Import backup
            <input type="file" accept="application/json,.json" hidden onChange={(e) => void importFile((e.target as HTMLInputElement).files?.[0])} />
          </label>
        </div>
        {msg && <p role="status">{msg}</p>}
      </section>

      <p class="dim small-print">
        Chess Coach is open source (GPL-3.0): <a href="https://github.com/oltiir/chess-coach">github.com/oltiir/chess-coach</a>.
        Engine: Stockfish. Bot: Maia-3. Puzzles: Lichess (CC0).
      </p>
    </div>
  );
}
