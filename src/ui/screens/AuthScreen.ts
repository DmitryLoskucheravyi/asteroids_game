import { AuthStore } from '../../core/auth';
import { Sfx } from '../../core/audio';
import { t, type TKey } from '../../core/i18n';
import { ApiError } from '../../core/api';
import { button, h } from '../dom';
import { Screen } from '../Screen';
import { MainMenuScreen } from './MainMenuScreen';

type Tab = 'login' | 'register';

const ERROR_KEYS: Record<string, string> = {
  bad_nickname: 'auth.err.badNickname',
  bad_email: 'auth.err.badEmail',
  bad_password: 'auth.err.badPassword',
  bad_request: 'auth.err.badRequest',
  nickname_taken: 'auth.err.nicknameTaken',
  email_taken: 'auth.err.emailTaken',
  invalid_credentials: 'auth.err.invalidCredentials',
};

/** Обов'язкові вхід/реєстрація перед головним меню. */
export class AuthScreen extends Screen {
  private tab: Tab = 'login';
  private busy = false;
  private errorEl!: HTMLElement;

  private setTab(tab: Tab): void {
    this.tab = tab;
    this.render();
    this.onShow();
  }

  private showError(code: string): void {
    this.errorEl.textContent = t((ERROR_KEYS[code] ?? 'auth.err.generic') as TKey);
    this.errorEl.classList.add('show');
  }

  protected build(): HTMLElement {
    this.errorEl = h('p', { class: 'auth-error' });

    const nickname = h('input', { type: 'text', placeholder: t('auth.nickname'), autocomplete: 'username', maxlength: 20, 'data-nav': true }) as HTMLInputElement;
    // на вході — нікнейм або email, на реєстрації — саме email
    const login = this.tab === 'login';
    const email = h('input', { type: login ? 'text' : 'email', placeholder: t(login ? 'auth.loginField' : 'auth.email'), autocomplete: login ? 'username' : 'email', autocapitalize: 'off', spellcheck: 'false', 'aria-label': t(login ? 'auth.loginField' : 'auth.email'), 'data-nav': true }) as HTMLInputElement;
    const password = h('input', { type: 'password', placeholder: t('auth.password'), autocomplete: this.tab === 'login' ? 'current-password' : 'new-password', 'data-nav': true }) as HTMLInputElement;

    const submit = async (): Promise<void> => {
      if (this.busy) return;
      this.errorEl.classList.remove('show');
      const emailV = email.value.trim();
      const passwordV = password.value;
      if (!emailV || !passwordV || (this.tab === 'register' && !nickname.value.trim())) {
        this.showError('bad_request');
        return;
      }
      this.busy = true;
      submitBtn.setAttribute('aria-disabled', 'true');
      try {
        if (this.tab === 'register') await AuthStore.register(nickname.value.trim(), emailV, passwordV);
        else await AuthStore.login(emailV, passwordV);
        Sfx.win();
        this.app.show(new MainMenuScreen(this.app));
      } catch (err) {
        Sfx.warning();
        this.showError(err instanceof ApiError ? err.code : 'network');
      } finally {
        this.busy = false;
        submitBtn.removeAttribute('aria-disabled');
      }
    };

    const onEnter = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') void submit();
    };
    [nickname, email, password].forEach((inp) => inp.addEventListener('keydown', onEnter));

    const submitBtn = button(this.tab === 'login' ? t('auth.loginBtn') : t('auth.registerBtn'), () => void submit(), 'btn primary auth-submit', {
      'data-autofocus': this.tab === 'login',
    });

    const tabs = h(
      'div',
      { class: 'seg auth-tabs' },
      button(t('auth.loginTab'), () => this.setTab('login'), `seg-btn${this.tab === 'login' ? ' on' : ''}`),
      button(t('auth.registerTab'), () => this.setTab('register'), `seg-btn${this.tab === 'register' ? ' on' : ''}`, { 'data-autofocus': this.tab === 'register' }),
    );

    return h(
      'div',
      { class: 'auth-screen' },
      h('div', { class: 'auth-card' },
        h('h1', { class: 'logo auth-logo' }, 'ASTEROIDS'),
        h('p', { class: 'auth-sub' }, t('auth.subtitle')),
        tabs,
        h('div', { class: 'auth-form' },
          this.tab === 'register' ? nickname : null,
          email,
          password,
          this.errorEl,
          submitBtn,
        ),
      ),
    );
  }
}
