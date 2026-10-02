import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT) || 8787,
  mongoUri: process.env.MONGO_URI || 'mongodb://asteroids:asteroids@localhost:27018/asteroids?authSource=admin',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  /** Спільний секрет для викликів між сервісами (/internal/*) — назовні шлюз їх не пропускає */
  internalToken: process.env.INTERNAL_TOKEN || 'dev-internal-token-change-me',
  /** Підпис квитків на ігровий сервер (окремо від токенів входу) */
  gameTicketSecret: process.env.GAME_TICKET_SECRET || 'dev-game-ticket-secret-change-me',
};
