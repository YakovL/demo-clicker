import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { usersRepository } from './users/repository';
import { env } from './config';
import { validateWebAppData } from '@grammyjs/validator';

type Env = {
  Variables: {
    tgId: number;
  };
};

const app = new Hono<Env>();

app.use('*', cors());

// Naive auth middleware - validates Telegram Mini App initData
// TODO: add an endpoint for auth and issue a token instead (initData expires, etc)
app.use('*', async (c, next) => {
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
    
    c.set('tgId', tgId);
    await next();
  } catch {
    return c.json({ error: 'invalid_user_data' }, 401);
  }
});

// GET /v1/me - returns User for the tgId
app.get('/v1/me', async (c) => {
  const tgId = c.get('tgId');
  const result = await usersRepository.findById(tgId);

  if (result.error) {
    console.error(`Error handling ${c.req.method} ${c.req.path}:`, result.error, result.originalError);
    return c.json({ error: 'internal_error' }, 500);
  }

  if (!result.user) {
    return c.json({ error: 'user_not_found' }, 404);
  }

  return c.json(result.user);
});

// POST /v1/me/clicks - adds legitimate clicks
app.post('/v1/me/clicks', async (c) => {
  const tgId = c.get('tgId');
  let claimedClicksCount: number;
  try {
    const body = await c.req.json<{ claimedClicksCount: number }>();
    claimedClicksCount = body.claimedClicksCount;
    if (typeof claimedClicksCount !== 'number') {
      return c.json({ error: 'invalid_claimed_clicks_count' }, 400);
    }
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const result = await usersRepository.addLegitimateClicks(tgId, claimedClicksCount);
  
  if (result.error) {
    if (result.error === 'invalid_clicks_count') {
      return c.json({ error: 'invalid_claimed_clicks_count' }, 400);
    }

    console.error(`Error handling ${c.req.method} ${c.req.path}:`, result.error, result.originalError);
    return c.json({ error: 'internal_error' }, 500);
  }
  
  if (!result.user) {
    return c.json({ error: 'user_not_found' }, 404);
  }
  
  return c.json(result.user);
});

const port = env.PORT;
console.log(`Starting server on http://localhost:${port}`);
serve({
  fetch: app.fetch,
  port
});
