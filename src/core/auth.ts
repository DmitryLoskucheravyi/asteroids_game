import { getToken, setToken } from './api';
import { Save } from './storage';
import { Server } from './server';

class AuthStoreClass {
  get isAuthenticated(): boolean {
    return !!getToken();
  }

  async register(nickname: string, email: string, password: string): Promise<void> {
    const { token, profile } = await Server.register(nickname, email, password);
    setToken(token);
    Save.applyProfile(profile);
    await this.migrateLegacyProgress();
  }

  async login(email: string, password: string): Promise<void> {
    const { token, profile } = await Server.login(email, password);
    setToken(token);
    Save.applyProfile(profile);
    await this.migrateLegacyProgress();
  }

  logout(): void {
    setToken(null);
    Save.clearProfile();
  }

  /** При вході/реєстрації перевіряє сесію, тягне свіжий профіль. */
  async restore(): Promise<boolean> {
    if (!getToken()) return false;
    try {
      const { profile } = await Server.profile();
      Save.applyProfile(profile);
      return true;
    } catch {
      return false;
    }
  }

  /** Одноразово переносить прогрес, накопичений до реєстрації (старий localStorage), в акаунт. */
  private async migrateLegacyProgress(): Promise<void> {
    if (!Save.hasLegacyProgress()) return;
    const legacy = Save.legacyProgress();
    if (!legacy) return;
    try {
      const { profile } = await Server.importLocal(legacy);
      Save.applyProfile(profile);
      Save.clearLegacyProgress();
    } catch {
      // не критично — спробуємо перенести іншим разом
    }
  }
}

export const AuthStore = new AuthStoreClass();
