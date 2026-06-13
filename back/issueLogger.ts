// TODO: throttle/use async logging/not stderr to avoid problems on high load
export const issueLogger = {
  log: (context: string, errorType: string, fullError: any) => {
    const now = new Date();
    const nowIso = now.toISOString();
    console.error(`${nowIso} | ${errorType} @ ${context}:`, fullError);
  }
};
