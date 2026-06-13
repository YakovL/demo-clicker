import { hc } from 'hono/client';
import type { AppType } from '../../../back/app';

const client = hc<AppType>(import.meta.env.VITE_API_BASE_URL);

export const api = {
  getMe: (jwt: string) => client.v1.me.$get('', {
    headers: { Authorization: `Bearer ${jwt}` },
  }),

  getMeWithRank: (jwt: string) => client.v1.me.rank.$get('', {
    headers: { Authorization: `Bearer ${jwt}` },
  }),

  postClicks: (claimedClicksCount: number, jwt: string) =>
    client.v1.me.clicks.$post({
      json: { claimedClicksCount },
    }, {
      headers: { Authorization: `Bearer ${jwt}` },
    }),

  getLeaderboard: (jwt: string) => client.v1.leaderboard.$get('', {
    headers: { Authorization: `Bearer ${jwt}` },
  }),
};
