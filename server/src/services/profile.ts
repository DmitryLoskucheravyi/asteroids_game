import { profileRouter } from '../routes/profile.js';
import { eventsRouter } from '../routes/events.js';
import { dailyRouter } from '../routes/daily.js';
import { questsRouter } from '../routes/quests.js';
import { passRouter } from '../routes/pass.js';
import { itemsRouter } from '../routes/items.js';
import { User } from '../models/User.js';
import { ensureRankSeason, getRank } from '../progress.js';
import { DEFAULT_WEAPON_ID } from '../content/weapons.js';
import { isQueueMode } from '../pvp/constants.js';
import { applyLeaver, applyMatchResults, type LeaverPayload, type MatchResultsPayload } from '../pvp/results.js';
import { startDbService } from './common.js';

/**
 * Сервіс профілю: прогрес гравця (літаки, прокачка, спорядження), події кампанії, щоденні нагороди,
 * квести, бойовий пропуск. Єдиний, хто записує результати PvP-матчів.
 */
void startDbService('profile', (app) => {
  app.use('/api/profile', profileRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/daily', dailyRouter);
  app.use('/api/quests', questsRouter);
  app.use('/api/pass', passRouter);
  // спорядження (не покупки — ті в магазині)
  app.use('/api/items', itemsRouter);

  /** Знімок гравця для матчмейкера: обраний літак, зброя, предмети, рейтинг у режимі. */
  app.get('/internal/player/:userId', async (req, res) => {
    const mode = isQueueMode(req.query.mode) ? req.query.mode : 'casual';
    const user = await User.findById(req.params.userId).catch(() => null);
    if (!user) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    ensureRankSeason(user);
    if (user.isModified()) await user.save();
    const progress = user.planeProgress.find((p) => p.planeId === user.selectedPlane);
    const loadout = user.loadouts.find((l) => l.planeId === user.selectedPlane);
    const ownedItem = (itemId: string | null | undefined) => (itemId ? user.items.find((i) => (i as unknown as { _id: { toString(): string } })._id.toString() === itemId) : undefined);
    const defIdOf = (itemId: string | null | undefined): string | null => ownedItem(itemId)?.defId ?? null;
    const weaponId = loadout?.weapon ?? DEFAULT_WEAPON_ID;
    res.json({
      userId: user._id.toString(),
      nickname: user.nickname,
      planeId: user.selectedPlane,
      weaponId,
      weaponLevel: ((user.weaponLevels ?? {}) as Record<string, number>)[weaponId] ?? 1,
      tier: progress?.tier ?? 1,
      level: progress?.level ?? 1,
      activeDefId: defIdOf(loadout?.active),
      passiveDefId: defIdOf(loadout?.passive),
      activeLevel: ownedItem(loadout?.active)?.level ?? 1,
      passiveLevel: ownedItem(loadout?.passive)?.level ?? 1,
      rankPoints: mode === 'casual' ? 0 : getRank(user, mode).points,
    });
  });

  app.post('/internal/match-results', async (req, res) => {
    const applied = await applyMatchResults(req.body as MatchResultsPayload);
    res.json({ ok: true, applied });
  });

  app.post('/internal/leaver', async (req, res) => {
    await applyLeaver(req.body as LeaverPayload);
    res.json({ ok: true });
  });
});
