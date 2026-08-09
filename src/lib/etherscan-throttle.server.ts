// Etherscan's free tier caps out around 5 req/sec. Once the wallet-flow scan
// (multiple exchange wallets × native + tracked-token calls) and the
// stablecoin-supply reads fire in the same intelligence cycle, an unthrottled
// Promise.all fan-out bursts well past that and a chunk of calls come back
// "Max calls per sec rate limit reached" — silently dropping real data.
// Every Etherscan caller routes through this shared queue instead.
let queue: Promise<void> = Promise.resolve();
const MIN_INTERVAL_MS = 220; // ~4.5 req/sec, safely under the 5/sec free-tier cap

export function throttledEtherscanCall<T>(fn: () => Promise<T>): Promise<T> {
  const scheduled = queue.then(() => new Promise<void>((resolve) => setTimeout(resolve, MIN_INTERVAL_MS)));
  queue = scheduled;
  return scheduled.then(fn);
}
