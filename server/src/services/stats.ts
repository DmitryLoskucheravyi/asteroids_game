import { leaderboardRouter } from '../routes/leaderboard.js';
import { startDbService } from './common.js';

/** Сервіс статистики: таблиці лідерів за різними показниками. */
void startDbService('stats', (app) => {
  app.use('/api/leaderboard', leaderboardRouter);
});
