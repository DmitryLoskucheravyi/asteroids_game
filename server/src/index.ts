import express from 'express';
import cors from 'cors';
import { env } from './env.js';
import { connectDb } from './db.js';
import { authRouter } from './routes/auth.js';
import { profileRouter } from './routes/profile.js';
import { eventsRouter } from './routes/events.js';
import { dailyRouter } from './routes/daily.js';
import { questsRouter } from './routes/quests.js';
import { passRouter } from './routes/pass.js';
import { cratesRouter } from './routes/crates.js';
import { itemsRouter } from './routes/items.js';

async function main(): Promise<void> {
  await connectDb();

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/daily', dailyRouter);
  app.use('/api/quests', questsRouter);
  app.use('/api/pass', passRouter);
  app.use('/api/crates', cratesRouter);
  app.use('/api/items', itemsRouter);

  app.listen(env.port, () => console.log(`[server] слухає на :${env.port}`));
}

void main();
