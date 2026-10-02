import './styles.css';
import { App } from './app/App';
import { getToken, onUnauthorized } from './core/api';
import { Server } from './core/server';
import { t } from './core/i18n';
import { toast } from './ui/Modal';
import { Save } from './core/storage';
import { AuthScreen } from './ui/screens/AuthScreen';
import { IntroScreen } from './ui/screens/IntroScreen';

const app = new App();
app.show(new IntroScreen(app));
app.start();

// пінг присутності раз на хвилину — друзі бачать, що ти онлайн
let partyInvites = 0;
const ping = (): void => {
  if (!getToken() || document.hidden) return;
  void Server.friendsPing()
    .then((r) => {
      // нове запрошення в групу — підказка, де його прийняти
      if ((r.partyInvites ?? 0) > partyInvites) toast(t('party.inviteToast'));
      partyInvites = r.partyInvites ?? 0;
    })
    .catch(() => {});
};
setInterval(ping, 15_000);

// протермінований/недійсний токен під час гри — повертаємо на екран входу
onUnauthorized.add(() => app.show(new AuthScreen(app)));

// хук для автотестів / налагодження: відкрийте гру з ?debug
if (import.meta.env.DEV || location.search.includes('debug')) Object.assign(window, { __app: app, __save: Save });
