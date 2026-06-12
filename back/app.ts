import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { usersRepository } from './users/repository';
import { env } from './config';

type Env = {
  Variables: {
    tgId: number;
  };
};

const app = new Hono<Env>();

// Auth middleware placeholder
// TODO: substitute hardcode with actual TMA credential resolving
app.use('*', async (c, next) => {
  c.set('tgId', 1234);
  await next();
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
