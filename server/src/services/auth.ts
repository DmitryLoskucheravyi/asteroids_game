import { authRouter } from '../routes/auth.js';
import { startDbService } from './common.js';

/** Сервіс авторизації: реєстрація й вхід, видає JWT (інші сервіси лише перевіряють підпис). */
void startDbService('auth', (app) => {
  app.use('/api/auth', authRouter);
});
