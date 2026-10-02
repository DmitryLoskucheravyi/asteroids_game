import type { GameLink } from '../../net/gameLink';
import type { App } from '../../app/App';
import { Sfx } from '../../core/audio';
import { t, type TKey } from '../../core/i18n';
import { Server } from '../../core/server';
import { Save } from '../../core/storage';
import { crate3d } from '../../game/CrateArt';
import { rankEmblem, rankInfo, type RankMode } from '../../game/ranks';
import type { MatchResultEntry } from '../../net/pvpProtocol';
import { Icons, button, h, icon } from '../dom';
import { Screen } from '../Screen';
import { MainMenuScreen } from './MainMenuScreen';
import { OnlineScreen } from './OnlineScreen';

const wait = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

/** Плавний підрахунок числа від from до to. */
function countTo(el: HTMLElement, from: number, to: number, ms: number, fmt: (n: number) => string): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (): void => {
      const k = Math.min(1, (performance.now() - start) / ms);
      el.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1 && el.isConnected) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Підсумок матчу — розгортається по кроках:
 * місце "вибухом" → фраги → монети, досвід, BP, рейтинг (по черзі з підрахунком) → нагороди (ящик, лут) → кнопки.
 */
export class MatchResultScreen extends Screen {
  private skip = false;

  constructor(
    app: App,
    private readonly results: MatchResultEntry[],
    private readonly socket: GameLink,
  ) {
    super(app);
  }

  private get me(): MatchResultEntry | undefined {
    return this.results.find((r) => r.id === this.socket.id);
  }

  private get ranked(): boolean {
    return this.results.some((r) => r.rank);
  }

  /** Режим матчу: рейтинговий режим визначаємо за розміром команд. */
  private get mode(): 'casual' | RankMode {
    if (!this.ranked) return 'casual';
    const me = this.me;
    const size = me ? this.results.filter((r) => r.team === me.team).length : 1;
    return size >= 4 ? 'squad' : size === 3 ? 'trio' : size === 2 ? 'duo' : 'solo';
  }

  private get teamSize(): number {
    const me = this.me;
    return me && me.team !== undefined ? this.results.filter((r) => r.team === me.team).length : 1;
  }

  private gainRow(cls: string, ic: HTMLElement, label: string, value: HTMLElement, extra: HTMLElement | null = null): HTMLElement {
    return h('div', { class: `mr-gain ${cls} pending` }, h('span', { class: 'mr-gain-ico' }, ic), h('span', { class: 'mr-gain-label' }, label), value, extra);
  }

  protected build(): HTMLElement {
    const me = this.me;
    const team = this.teamSize > 1;
    // у командних режимах показуємо місце команди
    const place = (team ? me?.teamPlace : me?.place) ?? this.results.length;
    const title = place === 1 ? t('matchresult.victory') : place <= 3 ? t('matchresult.top3') : t('matchresult.placeN', { n: place });

    const standings = h(
      'div',
      { class: 'mr-standings pending' },
      h('h3', {}, icon(Icons.trophy, 'ico'), t('matchresult.standings')),
      ...this.results.map((r, i) => {
        const self = r.id === this.socket.id;
        const pl = this.teamSize > 1 ? r.teamPlace ?? r.place : r.place;
        const ally = this.teamSize > 1 && me && r.team === me.team;
        return h(
          'div',
          { class: `mr-row${self ? ' self' : ''}${ally && !self ? ' ally' : ''}${pl === 1 ? ' winner' : ''}`, style: `--i:${i}` },
          h('span', { class: 'mr-row-place' }, pl === 1 ? icon(Icons.trophy, 'ico gold') : `#${pl}`),
          h('span', { class: 'mr-row-name' }, self ? `${r.nickname} · ${t('matchresult.you')}` : r.nickname),
          h('span', { class: 'mr-row-kills' }, icon(Icons.boss, 'ico'), String(r.kills)),
        );
      }),
    );

    const gains: HTMLElement[] = [];
    if (me) {
      gains.push(this.gainRow('coins', icon(Icons.coin, 'ico'), t('crates.coins'), h('b', { class: 'mr-num', 'data-to': String(me.reward.coins), 'data-prefix': '+' }, '+0')));
      if (me.reward.xp) gains.push(this.gainRow('xp', h('span', { class: 'xp-ico' }, 'XP'), t('crates.xp'), h('b', { class: 'mr-num', 'data-to': String(me.reward.xp), 'data-prefix': '+' }, '+0')));
      if (me.reward.bp) gains.push(this.gainRow('bp', icon(Icons.star, 'ico'), t('matchresult.bp'), h('b', { class: 'mr-num', 'data-to': String(me.reward.bp), 'data-prefix': '+' }, '+0')));
      if (me.rank) {
        const before = rankInfo(me.rank.before);
        gains.push(
          this.gainRow(
            'rank',
            h('span', { class: 'mr-rank-emblem', html: rankEmblem(before.id, before.roman, this.mode === 'casual' ? 'solo' : this.mode) }),
            `${t(before.nameKey)} ${before.roman}`,
            h('b', { class: `mr-num ${me.rank.delta >= 0 ? 'rp-up' : 'rp-down'}` }, `${me.rank.before} RP`),
            h('span', { class: 'mr-rank-bar' }, h('i', { style: `width:${Math.round(before.progress * 100)}%` })),
          ),
        );
      }
    }

    const loot = h('div', { class: 'mr-loot' });
    if (me?.reward.crate) loot.append(h('div', { class: 'mr-loot-item pending crate' }, crate3d(me.reward.crate, 76, 'tile-crate idle'), h('span', {}, t(`crate.${me.reward.crate}` as TKey))));
    if (me?.place === 1 && (me.jackpot.coins || me.jackpot.crystals)) {
      loot.append(
        h(
          'div',
          { class: 'mr-loot-item pending jackpot' },
          h('span', { class: 'mr-jackpot-ico' }, icon(Icons.crystal, 'ico')),
          h('span', {}, t('matchresult.jackpotYou')),
          h('b', {}, `${me.jackpot.coins} 🪙${me.jackpot.crystals ? ` · ${me.jackpot.crystals} 💎` : ''}`),
        ),
      );
    }

    return h(
      'div',
      { class: `page mr-screen place-${Math.min(place, 4)}` },
      h(
        'div',
        { class: 'mr-main' },
        h(
          'div',
          { class: 'mr-hero pending' },
          h('small', {}, this.ranked ? `${t('online.ranked')} · ${t(`mode.${this.mode}` as TKey)}` : t('online.casual')),
          h('div', { class: 'mr-place' }, place === 1 ? icon(Icons.trophy, 'ico') : null, h('span', {}, place === 1 ? '1' : `#${place}`)),
          h('h2', {}, title),
          team ? h('small', { class: 'mr-team-note' }, t('matchresult.teamPlace')) : null,
          h('div', { class: 'mr-kills pending' }, icon(Icons.boss, 'ico'), h('b', { class: 'mr-num', 'data-to': String(me?.kills ?? 0), 'data-prefix': '' }, '0'), h('span', {}, t('pvp.killsLabel'))),
        ),
        h('div', { class: 'mr-gains' }, ...gains),
        loot,
        h(
          'div',
          { class: 'mr-actions pending' },
          button(h('span', { class: 'launch-inner' }, icon(Icons.play), h('b', {}, t('matchresult.again'))), () => this.app.show(new OnlineScreen(this.app, this.mode)), 'launch-btn main', { 'data-autofocus': true }),
          button(h('span', { class: 'launch-inner' }, icon(Icons.back), h('b', {}, t('matchresult.exit'))), () => this.app.show(new MainMenuScreen(this.app)), 'launch-btn'),
        ),
      ),
      standings,
    );
  }

  /** Показати елемент (знімає .pending) і зачекати, якщо анімацію не пропущено. */
  private async reveal(el: Element | null, ms: number): Promise<void> {
    if (!el) return;
    el.classList.remove('pending');
    el.classList.add('in');
    if (!this.skip) await wait(ms);
  }

  private async play(): Promise<void> {
    const el = this.el;
    const me = this.me;
    const q = (s: string) => el.querySelector(s);

    await this.reveal(q('.mr-hero'), 650);
    if (me?.place === 1) Sfx.win();
    else if ((me?.place ?? 99) <= 3) Sfx.rareReward();
    else Sfx.lose();
    await this.reveal(q('.mr-standings'), 200);

    const kills = q('.mr-kills');
    await this.reveal(kills, 100);
    const kn = kills?.querySelector<HTMLElement>('.mr-num');
    if (kn) await countTo(kn, 0, Number(kn.dataset.to), this.skip ? 1 : 500, (v) => String(v));

    for (const row of el.querySelectorAll<HTMLElement>('.mr-gain')) {
      await this.reveal(row, 120);
      Sfx.pickup();
      const num = row.querySelector<HTMLElement>('.mr-num');
      if (row.classList.contains('rank') && me?.rank) {
        await this.animateRank(row, me.rank);
      } else if (num?.dataset.to) {
        await countTo(num, 0, Number(num.dataset.to), this.skip ? 1 : 750, (v) => `${num.dataset.prefix ?? ''}${v.toLocaleString('uk-UA')}`);
      }
      if (!this.skip) await wait(120);
    }

    for (const item of el.querySelectorAll('.mr-loot-item')) {
      await this.reveal(item, 450);
      Sfx.rareReward();
    }
    await this.reveal(q('.mr-actions'), 0);
    el.querySelector<HTMLElement>('.mr-actions .launch-btn.main')?.focus();
  }

  private async animateRank(row: HTMLElement, r: { before: number; after: number; delta: number }): Promise<void> {
    const num = row.querySelector<HTMLElement>('.mr-num')!;
    const bar = row.querySelector<HTMLElement>('.mr-rank-bar i')!;
    const label = row.querySelector<HTMLElement>('.mr-gain-label')!;
    const emblem = row.querySelector<HTMLElement>('.mr-rank-emblem')!;
    const before = rankInfo(r.before);
    const after = rankInfo(r.after);
    await countTo(num, r.before, r.after, this.skip ? 1 : 900, (v) => {
      const info = rankInfo(v);
      bar.style.width = `${Math.round(info.progress * 100)}%`;
      return `${v} RP (${r.delta >= 0 ? '+' : ''}${r.delta})`;
    });
    if (after.index !== before.index) {
      emblem.innerHTML = rankEmblem(after.id, after.roman, this.mode === 'casual' ? 'solo' : this.mode);
      label.textContent = `${t(after.nameKey)} ${after.roman}`;
      const up = after.index > before.index;
      row.classList.add(up ? 'promoted' : 'demoted');
      row.append(h('span', { class: `rank-change ${up ? 'up' : 'down'}` }, t(up ? 'rank.promoted' : 'rank.demoted')));
      if (up) Sfx.rareReward();
    }
  }

  onShow(): void {
    super.onShow();
    // клік/клавіша прискорюють анімацію до кінця
    const fast = (): void => {
      this.skip = true;
    };
    this.el.addEventListener('pointerdown', fast, { once: true });
    window.addEventListener('keydown', fast, { once: true });
    void this.play();
    // нагороду нарахував сервер — підтягуємо свіжий профіль (монети/кристали/квести/рейтинг)
    setTimeout(() => {
      void Server.profile().then(({ profile }) => Save.applyProfile(profile)).catch(() => {});
    }, 800);
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
