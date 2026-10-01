import { t, type TKey } from '../../core/i18n';
import { Icons, button, h, icon } from '../dom';
import { Screen } from '../Screen';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

type Tab = 'goal' | 'controls' | 'hazards';

/** Як грати + керування (об'єднані GuideForm і ControlsForm). */
export class HowToScreen extends Screen {
  private tab: Tab = 'goal';

  protected build(): HTMLElement {
    const tabs: [Tab, TKey][] = [
      ['goal', 'howto.tabGoal'],
      ['controls', 'howto.tabControls'],
      ['hazards', 'howto.tabHazards'],
    ];
    const kbd = (...keys: string[]) => h('span', { class: 'keys' }, ...keys.map((k) => h('kbd', {}, k)));
    const row = (keys: HTMLElement, text: string, ic?: string) => h('div', { class: 'ctrl-row' }, keys, h('span', {}, ic ? icon(ic) : null, text));

    let body: HTMLElement;
    if (this.tab === 'goal') {
      body = h('ul', { class: 'howto-list' }, ...(['howto.goal1', 'howto.goal2', 'howto.goal3', 'howto.goal4', 'howto.goal5'] as TKey[]).map((k) => h('li', {}, t(k))));
    } else if (this.tab === 'controls') {
      body = h(
        'div',
        { class: 'ctrl-list' },
        row(kbd('W', 'A', 'S', 'D'), t('howto.move')),
        row(kbd('↑', '←', '↓', '→'), t('howto.move')),
        row(kbd('1', 'E'), t('howto.freeze'), Icons.snow),
        row(kbd('2', 'Q'), t('howto.boost'), Icons.bolt),
        row(kbd('Space', 'Shift'), t('howto.jump'), Icons.dash),
        row(kbd('Esc', 'P'), t('howto.pause')),
        row(kbd('F'), t('howto.fullscreen')),
        h('p', { class: 'muted' }, t('howto.touch')),
      );
    } else {
      const hz = (k: 'comet' | 'homing' | 'bouncer' | 'wall') =>
        h('div', { class: `hz-row hz-${k}` }, icon(Icons[k], 'ico big'), h('div', {}, h('strong', {}, t(`hazard.${k}` as TKey)), h('p', {}, t(`howto.${k}` as TKey))));
      body = h('div', { class: 'hz-list' }, hz('comet'), hz('homing'), hz('bouncer'), hz('wall'));
    }

    return h(
      'div',
      { class: 'page howto' },
      screenHeader(t('howto.title'), () => this.onBack()),
      h(
        'div',
        { class: 'tabs', role: 'tablist' },
        ...tabs.map(([id, key]) =>
          button(t(key), () => {
            this.tab = id;
            this.render();
            this.el.querySelectorAll<HTMLElement>('.tab')[tabs.findIndex(([x]) => x === id)]?.focus();
          }, `tab${this.tab === id ? ' on' : ''}`, { role: 'tab', 'aria-selected': this.tab === id ? 'true' : 'false', 'data-autofocus': this.tab === id ? true : undefined }),
        ),
      ),
      h('div', { class: 'card howto-body' }, body),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
