import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { usersRepository } from './users/repository';

type Env = {
  Variables: {
    tgId: number;
  };
};

const port = 3000;

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

console.log(`Starting server on http://localhost:${port}`);
serve({
  fetch: app.fetch,
  port
});
