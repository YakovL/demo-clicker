export const config = {
  maxEnergy: 10,
  energyRegenPerMinute: 1,
  clickEnergyCost: 1,
}

export type User = {
  tgId: number;
  title: string;
  // TODO: auth stuff
  numberOfClicks: number;
  lastClickTimestamp: Date;
  lastClickEnergy: number;
}
