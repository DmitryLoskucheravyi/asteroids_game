import { levelName, t, type TKey } from '../../core/i18n';
import { formatTime } from '../../core/math';
import { Save } from '../../core/storage';
import { LEVELS, MAX_LEVEL, SECTORS, hazardsOf } from '../../game/levels';
import { Icons, button, h, icon } from '../dom';
import { Screen } from '../Screen';
import { GameScreen } from './GameScreen';
import { MainMenuScreen } from './MainMenuScreen';

export function screenHeader(title: string, onBack: () => void, right?: HTMLElement): HTMLElement {
  return h(
    'header',
    { class: 'screen-head' },
    button(h('span', {}, icon(Icons.back), t('common.back')), onBack, 'back-btn'),
    h('h2', {}, title),
    right ?? h('span', { class: 'spacer' }),
  );
}

export function starsRow(n: number, max = 3, color?: string): HTMLElement {
  return h(
    'div',
    { class: 'stars' },
    ...Array.from({ length: max }, (_, i) => icon(Icons.star, `ico star${i < n ? ' on' : ''}`, i < n && color ? `color:${color}` : undefined)),
  );
}

/** Вибір рівня кампанії (аналог LevelSelectForm, але 12 рівнів замість 5). */
export class LevelSelectScreen extends Screen {
  private focusLevel = 0;

  constructor(app: ConstructorParameters<typeof Screen>[0], focusLevel = 0) {
    super(app);
    this.focusLevel = focusLevel;
  }

  protected build(): HTMLElement {
    const unlocked = Save.data.unlocked;
    const target = this.focusLevel || Math.min(unlocked, MAX_LEVEL);

    const cards = LEVELS.map((cfg) => {
      const locked = cfg.id > unlocked;
      const stars = Save.starsFor(cfg.id);
      const content = h(
        'span',
        { class: 'lv-inner' },
        h('span', { class: 'lv-num' }, String(cfg.id).padStart(2, '0')),
        h('span', { class: 'lv-name' }, levelName(cfg.id)),
        h('span', { class: 'lv-haz' }, ...hazardsOf(cfg).map((hz) => icon(Icons[hz], `ico hz-${hz}`))),
        h('span', { class: 'lv-meta' }, h('span', { class: 'lv-time' }, icon(Icons.clock), formatTime(cfg.duration))),
        locked ? h('span', { class: 'lv-lock' }, icon(Icons.lock), t('levels.locked')) : starsRow(stars),
      );
      const b = button(content, () => {
        if (!locked) this.app.show(new GameScreen(this.app, 'campaign', cfg.id));
      }, `lv-card${locked ? ' locked' : ''}${stars === 3 ? ' perfect' : ''}`, {
        'aria-disabled': locked ? 'true' : undefined,
        'data-autofocus': cfg.id === target ? true : undefined,
        title: hazardsOf(cfg).map((hz) => t(`hazard.${hz}` as TKey)).join(', ') || undefined,
      });
      return b;
    });

    return h(
      'div',
      { class: 'page levels' },
      screenHeader(t('levels.title'), () => this.onBack(), h('div', { class: 'head-stat' }, icon(Icons.star, 'ico gold'), `${Save.totalStars}/${MAX_LEVEL * 3}`)),
      h('p', { class: 'page-sub' }, t('levels.subtitle')),
      h(
        'div',
        { class: 'lv-grid' },
        ...cards.flatMap((card, i) => {
          const sector = SECTORS.indexOf(i + 1 as (typeof SECTORS)[number]);
          return sector >= 0 ? [h('h3', { class: 'sector' }, t(`levels.sector${sector + 1}` as TKey)), card] : [card];
        }),
      ),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
