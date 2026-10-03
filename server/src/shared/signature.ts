/**
 * Фірмові гармати літаків — спільні для сервера й клієнта (без залежностей).
 *
 * Кожен літак, окрім основної зброї (ЛКМ), має власну гармату — активний скіл на X:
 * один залп (кілька пострілів з інтервалом), потім перезарядка. Фізика — ті самі види, що й у зброї
 * (кулі, ракети, промені, самонавідні), тож сервер симулює їх тим самим кодом і сам рахує влучання.
 */

export interface SignatureGun {
  id: string;
  kind: 'bullet' | 'rocket' | 'laser' | 'missile';
  /** Вигляд пострілу для інших (дріб, плазма, рейка) */
  visual?: 'pellet' | 'plasma' | 'rail';
  /** Пострілів у залпі та інтервал між ними, мс */
  shots: number;
  interval: number;
  /** Урон одного снаряда / променя */
  damage: number;
  speed: number;
  /** Розкид, рад */
  spread?: number;
  /** Скільки снарядів за один постріл (дріб) */
  pellets?: number;
  /** Кільце: снаряди рівномірно на всі боки */
  ring?: boolean;
  range?: number;
  splash?: number;
  /** Самонавідні: скільки ракет за постріл */
  salvo?: number;
  /** Перезарядка після залпу, с */
  cooldown: number;
  /** Колір у HUD / на сторінці літака */
  color: string;
}

export const SIGNATURE_GUNS: Record<string, SignatureGun> = {
  falcon: { id: 'twin_cannon', kind: 'bullet', shots: 12, interval: 60, damage: 4, speed: 1250, spread: 0.05, cooldown: 7, color: '#58d2ff' },
  phantom: { id: 'phase_lance', kind: 'laser', shots: 1, interval: 0, damage: 18, speed: 0, range: 700, cooldown: 6, color: '#ff5ad0' },
  blaze: { id: 'flamethrower', kind: 'bullet', visual: 'pellet', shots: 6, interval: 120, damage: 2.4, speed: 700, spread: 0.35, pellets: 5, range: 320, cooldown: 8, color: '#ff7a2a' },
  wasp: { id: 'stinger', kind: 'laser', visual: 'rail', shots: 3, interval: 150, damage: 9, speed: 0, range: 900, cooldown: 7, color: '#ffd24a' },
  collector: { id: 'magnet_missiles', kind: 'missile', shots: 1, interval: 0, damage: 14, speed: 520, salvo: 2, cooldown: 8, color: '#18c8b0' },
  swift: { id: 'needle_burst', kind: 'bullet', shots: 20, interval: 35, damage: 2.6, speed: 1400, spread: 0.08, cooldown: 8, color: '#28c8f0' },
  titan: { id: 'heavy_shell', kind: 'rocket', shots: 1, interval: 0, damage: 38, speed: 650, splash: 160, cooldown: 8, color: '#ffb020' },
  chronos: { id: 'chrono_ray', kind: 'laser', shots: 4, interval: 200, damage: 7, speed: 0, range: 800, cooldown: 8, color: '#8a3cff' },
  viper: { id: 'venom_spread', kind: 'bullet', visual: 'pellet', shots: 2, interval: 250, damage: 3, speed: 950, spread: 0.22, pellets: 7, range: 480, cooldown: 7, color: '#6adc2a' },
  thunder: { id: 'lightning', kind: 'laser', visual: 'rail', shots: 1, interval: 0, damage: 30, speed: 0, range: 1000, cooldown: 9, color: '#9fd0ff' },
  bastion: { id: 'mortar', kind: 'rocket', shots: 3, interval: 220, damage: 20, speed: 560, splash: 120, spread: 0.1, cooldown: 9, color: '#ff7a2a' },
  ufo: { id: 'tractor_beam', kind: 'laser', shots: 6, interval: 120, damage: 5, speed: 0, range: 600, cooldown: 8, color: '#3adc78' },
  nova: { id: 'star_salvo', kind: 'missile', shots: 1, interval: 0, damage: 10, speed: 520, salvo: 4, cooldown: 9, color: '#a06aff' },
  phoenix: { id: 'fire_storm', kind: 'rocket', visual: 'plasma', shots: 5, interval: 100, damage: 12, speed: 700, splash: 70, spread: 0.15, cooldown: 9, color: '#ff5a1f' },
  eclipse: { id: 'corona_burst', kind: 'bullet', shots: 1, interval: 0, damage: 5, speed: 900, pellets: 16, ring: true, range: 520, cooldown: 9, color: '#ffb020' },
};

export const signatureFor = (planeId: string): SignatureGun => SIGNATURE_GUNS[planeId] ?? SIGNATURE_GUNS.falcon;

/** Скільки снарядів максимум за один залп (для перевірки темпу на сервері). */
export const signatureVolley = (g: SignatureGun): number => g.shots * (g.pellets ?? 1) * (g.salvo ?? 1);
