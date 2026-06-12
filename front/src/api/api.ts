import { hc } from 'hono/client';
import type { AppType } from '../../../back/app';

const client = hc<AppType>(import.meta.env.VITE_API_BASE_URL);

export const api = {
  getMe: (jwt: string) => client.v1.me.$get('', {
    headers: { Authorization: `Bearer ${jwt}` },
  }),
};
