import { levelName, t } from '../../core/i18n';
import { formatTime } from '../../core/math';
import { Save } from '../../core/storage';
import { LEVELS, MAX_LEVEL } from '../../game/levels';
import { Icons, h, icon } from '../dom';
import { Screen } from '../Screen';
import { screenHeader, starsRow } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

/** Рекорди: топ-5 у виживанні + зірки кампанії. */
export class RecordsScreen extends Screen {
  protected build(): HTMLElement {
    const top = Save.data.survivalTop;
    const medals = ['gold', 'silver', 'bronze', '', ''];
    const survival = top.length
      ? h(
          'ol',
          { class: 'rec-list' },
          ...top.map((r, i) => h('li', { class: medals[i] }, h('span', { class: 'rec-pos' }, `#${i + 1}`), h('span', { class: 'rec-time' }, formatTime(r.time)), h('span', { class: 'rec-date' }, r.date))),
        )
      : h('p', { class: 'muted' }, t('records.empty'));

    const done = LEVELS.filter((l) => Save.starsFor(l.id) > 0).length;
    const campaign = h(
      'div',
      { class: 'rec-levels' },
      ...LEVELS.map((l) =>
        h('div', { class: `rec-lv${l.id > Save.data.unlocked ? ' locked' : ''}` }, h('span', { class: 'rec-lv-num' }, String(l.id)), h('span', { class: 'rec-lv-name' }, levelName(l.id)), starsRow(Save.starsFor(l.id))),
      ),
    );

    return h(
      'div',
      { class: 'page records' },
      screenHeader(t('records.title'), () => this.onBack()),
      h(
        'div',
        { class: 'rec-grid' },
        h('section', { class: 'card' }, h('h3', {}, icon(Icons.trophy, 'ico gold'), t('records.survival')), survival),
        h(
          'section',
          { class: 'card' },
          h('h3', {}, icon(Icons.star, 'ico gold'), t('records.campaign'), h('small', {}, ` ${Save.totalStars}/${MAX_LEVEL * 3} · ${t('records.levelsDone')}: ${done}/${MAX_LEVEL}`)),
          campaign,
        ),
      ),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
