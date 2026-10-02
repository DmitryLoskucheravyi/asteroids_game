import { randomInt } from 'node:crypto';
import type { HydratedDocument } from 'mongoose';
import { User, type UserDoc } from './models/User.js';

/** Цифри й великі латинські літери без схожих на вигляд 0/O та 1/I. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const LENGTH = 10;

function generate(): string {
  let s = '#';
  for (let i = 0; i < LENGTH; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** Приводить введене гравцем до формату "#XXXXXXXXXX" (решітка необовʼязкова, регістр байдужий). */
export function normalizePublicId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase().replace(/^#/, '');
  return /^[0-9A-Z]{6,14}$/.test(s) ? `#${s}` : null;
}

/** Видає гравцю унікальний публічний ID, якщо його ще немає (нові й старі акаунти). */
export async function ensurePublicId(user: HydratedDocument<UserDoc>): Promise<void> {
  if (user.publicId) return;
  for (let i = 0; i < 8; i++) {
    const id = generate();
    if (!(await User.exists({ publicId: id }))) {
      user.publicId = id;
      return;
    }
  }
  throw new Error('public_id_exhausted');
}
