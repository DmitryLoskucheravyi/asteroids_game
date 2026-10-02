import { shopRouter } from '../routes/shop.js';
import { startDbService } from './common.js';

/** Сервіс магазину: покупки предметів, зброї, літаків і преміум-пропуску. */
void startDbService('shop', (app) => {
  app.use('/api', shopRouter);
});
