export const config = {
  maxEnergy: 10,
  energyRegenPerMinute: 1,
  clickEnergyCost: 1,

  leaderboardSize: 25,
  excessiveClicksTolerance: 1.5,
}

export type User = {
  tgId: number;
  title: string;
  // no auth stuff since we're using jwt (to reduce the load on db)
  numberOfClicks: number;
  lastClickTimestamp: Date;
  lastClickEnergy: number;
  // no idempotency / duplicate protection (lastClientSeq: number;)
  // as long as duplicated legitimate requests are not a problem
}
