export const weeklyContentTarget = 20;

// A publication week starts on Monday at 09:00 in Shanghai (01:00 UTC).
// Manual retries before that boundary still belong to the preceding issue.
export function contentWeekKey(now = new Date()) {
  const date = new Date(new Date(now).getTime() - 60 * 60 * 1000);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid content publication date");
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
