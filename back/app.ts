import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import jwt from 'jsonwebtoken';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { usersRepository } from './users/repository';
import { env } from './config';
import { validateWebAppData } from '@grammyjs/validator';
import { issueLogger } from './issueLogger';

type Env = {
  Variables: {
    tgId: number;
  };
};

type jwtDataShape = {
  tgId: number;
}

const addClicksSchema = z.object({
  claimedClicksCount: z.number(),
});

const app = new Hono<Env>()
  .use('*', cors())

  // POST /v1/auth/telegram - validates initData and issues JWT
  .post('/v1/auth/telegram', async (c) => {
    const initData = c.req.header('X-Telegram-Init-Data');
    if (!initData) {
      return c.json({ error: 'missing_init_data' as const }, 401);
    }
    if (typeof initData !== 'string') {
      return c.json({ error: 'invalid_init_data_nonstring' as const }, 400);
    }

    const searchParams = new URLSearchParams(initData);
    if (!validateWebAppData(env.TELEGRAM_BOT_TOKEN, searchParams)) {
      return c.json({ error: 'invalid_signature' as const }, 401);
    }

    const userStr = searchParams.get('user');
    if (!userStr) {
      return c.json({ error: 'missing_user_in_init_data' as const }, 400);
    }

    try {
      const user = JSON.parse(userStr);
      const tgId = user.id;
      if (typeof tgId !== 'number') {
        return c.json({ error: 'invalid_user_id' }, 401);
      }

      const data: jwtDataShape = { tgId };
      const token = jwt.sign(data, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
      return c.json({ jwt: token });
    } catch {
      return c.json({ error: 'invalid_user_data' }, 401);
    }
  })

  // Auth middleware - validates Bearer JWT token
  .use('*', async (c, next) => {
    // Skip auth for /v1/auth/* endpoints
    if (c.req.path.startsWith('/v1/auth/')) {
      await next();
      return;
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'missing_authorization_header' as const }, 401);
    }
    if (!authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'invalid_authorization_format' as const }, 401);
    }
    const token = authHeader.slice(7);

    try {
      const decoded = jwt.verify(token, env.jwtSecret) as jwtDataShape;
      if (typeof decoded.tgId !== 'number') {
        return c.json({ error: 'invalid_token_payload' }, 401);
      }

      c.set('tgId', decoded.tgId);
      await next();
    } catch (error) {
      return c.json({ error: 'invalid_token' }, 401);
    }
  })

  // GET /v1/me - returns User for the tgId
  .get('/v1/me', async (c) => {
    const tgId = c.get('tgId');
    const result = await usersRepository.findById(tgId);

    if (result.error) {
      issueLogger.log(
        `${c.req.method} ${c.req.path} for ${tgId}`,
        result.error,
        'originalError' in result ? result.originalError : undefined);
      return c.json({ error: 'internal_error' }, 500);
    }

    if (!result.user) {
      return c.json({ error: 'user_not_found' }, 404);
    }

    return c.json(result.user);
  })

  // POST /v1/me/clicks - adds legitimate clicks
  .post('/v1/me/clicks', zValidator('json', addClicksSchema), async (c) => {
    const tgId = c.get('tgId');
    const body = c.req.valid('json');
    const claimedClicksCount = body.claimedClicksCount;

    const result = await usersRepository.addLegitimateClicks(tgId, claimedClicksCount);

    if (result.error) {
      if (result.error === 'invalid_clicks_count') {
        return c.json({ error: 'invalid_claimed_clicks_count' }, 400);
      }

      issueLogger.log(
        `${c.req.method} ${c.req.path} for ${tgId}, ${claimedClicksCount}`,
        result.error,
        'originalError' in result ? result.originalError : undefined);
      return c.json({ error: 'internal_error' }, 500);
    }

    if (!result.user) {
      return c.json({ error: 'user_not_found' }, 404);
    }

    return c.json(result.user);
  })

  // GET /v1/leaderboard - returns { rank, title, numberOfClicks }[]
  .get('/v1/leaderboard', async (c) => {
    const tgId = c.get('tgId');
    const result = await usersRepository.getLeaderboardWithUser(tgId);

    if (result.error) {
      issueLogger.log(`${c.req.method} ${c.req.path} for ${tgId}`,
        result.error,
        'originalError' in result ? result.originalError : undefined);
      return c.json({ error: 'internal_error' }, 500);
    }

    const leaderboard = result.leaderboard.map(({ rank, title, numberOfClicks }) => ({
      rank,
      title,
      numberOfClicks
    }));
    
    return c.json(leaderboard);
  })

  // GET /v1/me/rank - returns user and their rank
  .get('/v1/me/rank', async (c) => {
    const tgId = c.get('tgId');
    const result = await usersRepository.getRankAndUser(tgId);

    if (result.error) {
      issueLogger.log(`${c.req.method} ${c.req.path} for ${tgId}`,
        result.error,
        'originalError' in result ? result.originalError : undefined);
      return c.json({ error: 'internal_error' }, 500);
    }

    if (result.rank === null) {
      return c.json({ error: 'user_not_found' }, 404);
    }

    return c.json({
      rank: result.rank,
      user: 'user' in result ? result.user : null,
    });
  })
;

const port = env.PORT;
console.log(`Starting server on http://localhost:${port}`);
serve({
  fetch: app.fetch,
  port,
});

export type AppType = typeof app;
