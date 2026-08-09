const KEY = "eliteflux:coach-prefill";

/** Stash a question so the coach asks it automatically on the next page load. */
export function setCoachPrefill(question: string) {
  try {
    sessionStorage.setItem(KEY, question);
  } catch {
    /* storage unavailable — the coach simply opens empty */
  }
}

/** Read and clear a stashed question. Returns null when there is nothing pending. */
export function consumeCoachPrefill(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v) sessionStorage.removeItem(KEY);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}
