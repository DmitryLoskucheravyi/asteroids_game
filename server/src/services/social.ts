import { friendsRouter } from '../routes/friends.js';
import { partyRouter } from '../routes/party.js';
import { playersRouter } from '../routes/players.js';
import { setInMatch } from '../presence.js';
import { getParty, getPartyById, setIdle, setSearching } from '../social/party.js';
import { startDbService } from './common.js';

/**
 * Соціальний сервіс: друзі, групи й присутність (онлайн / у бою). Групи й присутність живуть
 * у памʼяті цього процесу — тож сервіс запускається в одному екземплярі.
 */
void startDbService('social', (app) => {
  app.use('/api/friends', friendsRouter);
  app.use('/api/party', partyRouter);
  app.use('/api/players', playersRouter);

  /** Ігровий сервер: гравець увійшов у бій / вийшов з нього. */
  app.post('/internal/presence', (req, res) => {
    const { userId, inMatch } = req.body ?? {};
    if (typeof userId === 'string') setInMatch(userId, !!inMatch);
    res.json({ ok: true });
  });

  /** Матчмейкер: група за id (щоб поставити її в чергу цілою). */
  app.get('/internal/party/:id', (req, res) => {
    const p = getPartyById(req.params.id);
    res.json({ party: p ? { id: p.id, mode: p.mode, state: p.state, members: p.members } : null });
  });

  /** Матчмейкер: гравець скасував пошук — зупиняємо пошук для всієї групи. */
  app.post('/internal/party/stop', (req, res) => {
    const userId = String(req.body?.userId ?? '');
    if (getParty(userId)?.state === 'searching') setSearching(userId, false);
    res.json({ ok: true });
  });

  app.post('/internal/party/:id/idle', (req, res) => {
    setIdle(req.params.id);
    res.json({ ok: true });
  });
});
