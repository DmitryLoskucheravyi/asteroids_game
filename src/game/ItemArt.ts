import { getItemDef } from './items';
import { getWeaponDef } from './weapons';

/**
 * Власний зовнішній вигляд кожного предмета — SVG 64×64.
 * `c` — основний колір предмета, `d` — темний відтінок для обʼєму.
 */
const ART: Record<string, (c: string) => string> = {
  magnet_booster: (c) => `
    <path d="M18 14v20a14 14 0 0 0 28 0V14h-9v20a5 5 0 0 1-10 0V14z" fill="${c}" stroke="#0b0a18" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="18" y="10" width="9" height="8" fill="#e8ecf5" stroke="#0b0a18" stroke-width="2.5"/>
    <rect x="37" y="10" width="9" height="8" fill="#e8ecf5" stroke="#0b0a18" stroke-width="2.5"/>
    <path d="M10 50c4-3 8-3 12 0M42 50c4-3 8-3 12 0M26 56c4-3 8-3 12 0" stroke="${c}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".8"/>`,
  armor_plating: (c) => `
    <path d="M32 6 52 13v17c0 13-9 22-20 27C21 52 12 43 12 30V13z" fill="${c}" stroke="#0b0a18" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 13 45 18v12c0 9-6 15-13 19-7-4-13-10-13-19V18z" fill="#e8ecf5" opacity=".35"/>
    <circle cx="20" cy="20" r="2" fill="#0b0a18"/><circle cx="44" cy="20" r="2" fill="#0b0a18"/><circle cx="32" cy="46" r="2" fill="#0b0a18"/>`,
  targeting_cpu: (c) => `
    <rect x="16" y="16" width="32" height="32" rx="4" fill="#1a1c34" stroke="${c}" stroke-width="3"/>
    <path d="M22 16v-6M32 16v-6M42 16v-6M22 54v-6M32 54v-6M42 54v-6M16 22h-6M16 32h-6M16 42h-6M54 22h-6M54 32h-6M54 42h-6" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="32" cy="32" r="9" fill="none" stroke="#fff" stroke-width="2.5"/>
    <path d="M32 20v7M32 37v7M20 32h7M37 32h7" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="32" cy="32" r="2.5" fill="#ff4a5a"/>`,
  afterburner: (c) => `
    <path d="M22 8h20l4 22H18z" fill="#9aa6c0" stroke="#0b0a18" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="20" y="28" width="24" height="6" fill="#5a6280" stroke="#0b0a18" stroke-width="2.5"/>
    <path d="M22 34c-2 10 4 16 10 24 6-8 12-14 10-24z" fill="${c}" stroke="#0b0a18" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M27 36c-1 6 2 10 5 14 3-4 6-8 5-14z" fill="#fff3a0"/>`,
  nano_coating: (c) => `
    <path d="M32 6l22 13v26L32 58 10 45V19z" fill="${c}" stroke="#0b0a18" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 6v52M10 19l44 26M54 19 10 45" stroke="#fff" stroke-width="1.5" opacity=".35"/>
    <path d="M32 18l12 7v14l-12 7-12-7V25z" fill="#fff" opacity=".25"/>
    <circle cx="32" cy="32" r="5" fill="#fff"/>`,
  overclock_core: (c) => `
    <circle cx="32" cy="32" r="22" fill="#1a1c34" stroke="${c}" stroke-width="3"/>
    <path d="M32 10v6M32 48v6M10 32h6M48 32h6M16.4 16.4l4.3 4.3M43.3 43.3l4.3 4.3M47.6 16.4l-4.3 4.3M20.7 43.3l-4.3 4.3" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="32" cy="32" r="11" fill="${c}"/>
    <path d="M34 22l-8 12h6l-2 8 8-12h-6z" fill="#fff" stroke="#0b0a18" stroke-width="1.5" stroke-linejoin="round"/>`,
  phoenix_heart: (c) => `
    <path d="M32 54S10 41 10 24a11 11 0 0 1 22-4 11 11 0 0 1 22 4c0 17-22 30-22 30z" fill="#ff5a1f" stroke="#0b0a18" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 46s-13-8-13-19a6 6 0 0 1 13-3 6 6 0 0 1 13 3c0 11-13 19-13 19z" fill="${c}"/>
    <path d="M32 40c-3-4-4-8-1-13 1 3 3 3 4 1 2 4 1 8-3 12z" fill="#fff8d0"/>
    <path d="M6 18l6 4M58 18l-6 4M14 8l3 6M50 8l-3 6" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>`,
  nano_repair: (c) => `
    <rect x="10" y="10" width="44" height="44" rx="10" fill="#1a1c34" stroke="${c}" stroke-width="3"/>
    <path d="M26 18h12v8h8v12h-8v8H26v-8h-8V26h8z" fill="${c}" stroke="#0b0a18" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M14 46l6-6M44 20l6-6" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6"/>`,
  emp_pulse: (c) => `
    <circle cx="32" cy="32" r="24" fill="none" stroke="${c}" stroke-width="2" opacity=".35"/>
    <circle cx="32" cy="32" r="17" fill="none" stroke="${c}" stroke-width="2.5" opacity=".6"/>
    <circle cx="32" cy="32" r="10" fill="${c}" stroke="#0b0a18" stroke-width="2.5"/>
    <path d="M34 24l-6 9h5l-2 7 6-9h-5z" fill="#fff"/>
    <path d="M6 32h6M52 32h6M32 6v6M32 52v6" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`,
  decoy_flare: (c) => `
    <path d="M32 8 44 34 32 28 20 34z" fill="${c}" opacity=".35" transform="translate(-9 6)"/>
    <path d="M32 8 44 34 32 28 20 34z" fill="${c}" opacity=".6" transform="translate(9 6)"/>
    <path d="M32 8 46 40 32 32 18 40z" fill="#e8ecf5" stroke="#0b0a18" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M18 48c5 4 23 4 28 0" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="4 4"/>`,
  overdrive: (c) => `
    <path d="M8 44a24 24 0 0 1 48 0" fill="none" stroke="#1a1c34" stroke-width="10" stroke-linecap="round"/>
    <path d="M8 44a24 24 0 0 1 48 0" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round" stroke-dasharray="58 100"/>
    <path d="M32 44 48 22" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
    <circle cx="32" cy="44" r="6" fill="${c}" stroke="#0b0a18" stroke-width="2.5"/>
    <path d="M14 54h36" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`,
  missile_swarm: (c) => `
    ${[
      [14, 40, -20],
      [32, 34, 0],
      [50, 40, 20],
    ]
      .map(
        ([x, y, r]) => `<g transform="rotate(${r} ${x} ${y})">
      <path d="M${x} ${y - 24}l5 9v17h-10V${y - 15}z" fill="#e8ecf5" stroke="#0b0a18" stroke-width="2" stroke-linejoin="round"/>
      <path d="M${x} ${y - 24}l5 9h-10z" fill="${c}"/>
      <path d="M${x - 5} ${y - 2}l-4 6h4zM${x + 5} ${y - 2}l4 6h-4z" fill="${c}" stroke="#0b0a18" stroke-width="1.5"/>
      <path d="M${x - 3} ${y + 3}c0 5 3 8 3 10 0-2 3-5 3-10z" fill="#ff8a3a"/></g>`,
      )
      .join('')}`,
};

const WEAPON_ART: Record<string, string> = {
  machine_gun: `
    <rect x="8" y="26" width="34" height="12" rx="3" fill="#5a6280" stroke="#0b0a18" stroke-width="2.5"/>
    <rect x="40" y="29" width="18" height="6" fill="#9aa6c0" stroke="#0b0a18" stroke-width="2.5"/>
    <path d="M14 38v12h10V38" fill="#3a4060" stroke="#0b0a18" stroke-width="2.5"/>
    <path d="M14 26v-6h18v6" fill="#9aa6c0" stroke="#0b0a18" stroke-width="2.5"/>
    <path d="M60 24l2-3M61 32h3M60 40l2 3" stroke="#ffd24a" stroke-width="2.5" stroke-linecap="round"/>`,
  rocket_launcher: `
    <rect x="6" y="24" width="44" height="16" rx="3" fill="#4a5a3a" stroke="#0b0a18" stroke-width="2.5"/>
    <path d="M50 24l8 3v10l-8 3z" fill="#e8ecf5" stroke="#0b0a18" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M58 27l4 5-4 5z" fill="#ff4a3a"/>
    <path d="M18 40v10h8V40" fill="#3a4a2a" stroke="#0b0a18" stroke-width="2.5"/>
    <rect x="22" y="18" width="10" height="6" fill="#9aa6c0" stroke="#0b0a18" stroke-width="2.5"/>`,
};

const wrap = (body: string): string => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

/** SVG-розмітка предмета (його власний вигляд). */
export function itemSvg(defId: string): string {
  const def = getItemDef(defId);
  const art = ART[defId];
  if (!def || !art) return wrap('<circle cx="32" cy="32" r="18" fill="#5a6280"/>');
  return wrap(art(def.color));
}

export function weaponSvg(id: string): string {
  return wrap(WEAPON_ART[getWeaponDef(id)?.id ?? 'machine_gun'] ?? WEAPON_ART.machine_gun);
}
