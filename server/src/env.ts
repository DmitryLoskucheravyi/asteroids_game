import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT) || 8787,
  mongoUri: process.env.MONGO_URI || 'mongodb://asteroids:asteroids@localhost:27018/asteroids?authSource=admin',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
};
