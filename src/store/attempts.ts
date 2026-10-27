import { kvGet, kvSet, openDb } from './db';
import type { Attempt } from './types';

export async function deviceId(): Promise<string> {
  let id = await kvGet<string>('device');
  if (!id) { id = crypto.randomUUID(); await kvSet('device', id); }
  return id;
}

export async function logAttempt(a: Omit<Attempt, 'id' | 'device'>): Promise<Attempt> {
  const full: Attempt = { ...a, id: crypto.randomUUID(), device: await deviceId() };
  await (await openDb()).put('attempts', full);
  return full;
}

export async function allAttempts(): Promise<Attempt[]> {
  return (await openDb()).getAll('attempts');
}
