import dotenv from 'dotenv';
import { config as gameConfig } from './users/model';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
}

const TELEGRAM_TMA_URL = process.env.TELEGRAM_TMA_URL;
if (!TELEGRAM_TMA_URL) {
  throw new Error('TELEGRAM_TMA_URL environment variable is not set');
}

const MONGODB_CONNECT_URL = process.env.MONGODB_CONNECT_URL;
if (!MONGODB_CONNECT_URL) {
  throw new Error('MONGODB_CONNECT_URL environment variable is not set');
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
if (isNaN(PORT)) {
  throw new Error('PORT environment variable must be a valid number');
}

export const env = {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_TMA_URL,
  MONGODB_CONNECT_URL,
  PORT,
  jwtSecret: TELEGRAM_BOT_TOKEN,
  // may want to make these adjustable in the future
  jwtExpiresIn: '7d',
  leaderboardCacheTtlMs: 1000,
} as const;

export { gameConfig };
