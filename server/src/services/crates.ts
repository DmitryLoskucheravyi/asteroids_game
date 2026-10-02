import { cratesRouter } from '../routes/crates.js';
import { startDbService } from './common.js';

/** Сервіс ящиків: список і відкриття (з розіграшем вмісту на сервері). */
void startDbService('crates', (app) => {
  app.use('/api/crates', cratesRouter);
});
