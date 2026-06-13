import { hc } from 'hono/client';
import type { AppType } from '../../../back/app';

const client = hc<AppType>(import.meta.env.VITE_API_BASE_URL);

const clickDebounceState = {
  timeout: null as ReturnType<typeof setTimeout> | null,
  accumulatedClicks: 0,
  pendingResolve: null as ((value: Awaited<ReturnType<typeof api.postClicks>>) => void) | null,
};

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

  clickDebounceIntervalMs: 1000,
  postClicksDebounced: (claimedClicksCount: number, jwt: string): ReturnType<typeof api.postClicks> => {
    clickDebounceState.accumulatedClicks += claimedClicksCount;

    if (clickDebounceState.timeout) {
      clearTimeout(clickDebounceState.timeout);
    }

    return new Promise((resolve) => {
      clickDebounceState.pendingResolve = resolve;

      clickDebounceState.timeout = setTimeout(async () => {
        if (clickDebounceState.accumulatedClicks > 0) {
          const result = await api.postClicks(clickDebounceState.accumulatedClicks, jwt);
          clickDebounceState.accumulatedClicks = 0;
          if (clickDebounceState.pendingResolve) {
            clickDebounceState.pendingResolve(result);
            clickDebounceState.pendingResolve = null;
          }
        }
        clickDebounceState.timeout = null;
      }, api.clickDebounceIntervalMs);
    });
  },

  getLeaderboard: (jwt: string) => client.v1.leaderboard.$get('', {
    headers: { Authorization: `Bearer ${jwt}` },
  }),
};
