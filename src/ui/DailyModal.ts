import { Sfx } from '../core/audio';
import { t } from '../core/i18n';
import { DAILY_REWARDS, claimDaily, dailyState } from '../game/economy';
import { Icons, button, coinBadge, h, icon } from './dom';
import { Modal } from './Modal';

/** Вікно щоденної нагороди: 7 днів серії, сьогоднішній день підсвічено. */
export function openDailyModal(onClaimed: () => void): Modal {
  const st = dailyState();

  const cards = DAILY_REWARDS.map((reward, i) => {
    const day = i + 1;
    const done = day < st.day || (day === st.day && !st.available);
    const today = day === st.day;
    return h(
      'div',
      { class: `daily-card${done ? ' done' : ''}${today ? ' today' : ''}${day === DAILY_REWARDS.length ? ' big' : ''}` },
      h('span', { class: 'daily-day' }, t('daily.day', { n: day })),
      icon(done ? Icons.star : Icons.gift, 'ico daily-ico'),
      coinBadge(reward, 'coin-badge small'),
    );
  });

  const status = h('p', { class: 'daily-status' }, st.available ? '' : t('daily.claimed'));
  const actions: HTMLElement[] = [];
  const m = new Modal({
    title: t('daily.title'),
    cls: 'daily-modal',
    body: [h('p', {}, t('daily.sub')), h('div', { class: 'daily-grid' }, ...cards), status],
    actions,
    onEscape: () => m.close(),
  });

  if (st.available) {
    const claim = button(h('span', { class: 'claim-label' }, t('daily.claim', { n: st.reward }), icon(Icons.coin, 'ico coin')), () => {
      const got = claimDaily();
      if (!got) return;
      Sfx.win();
      const today = cards[st.day - 1];
      today.classList.add('done', 'claimed');
      today.querySelector('.daily-ico')!.innerHTML = Icons.star;
      status.textContent = t('daily.claimed');
      claim.remove();
      close.focus();
      onClaimed();
    }, 'btn primary', { 'data-autofocus': true });
    actions.push(claim);
  }
  const close = button(t('common.close'), () => m.close(), 'btn', st.available ? {} : { 'data-autofocus': true });
  actions.push(close);
  m.el.querySelector('.modal-actions')!.append(...actions);
  return m.open();
}
