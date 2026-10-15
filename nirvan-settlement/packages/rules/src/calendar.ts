/** Business calendar is Asia/Dubai (UTC+4, no DST). */

export function dubaiYearMonth(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) {
    throw new Error("could not format Dubai year-month");
  }
  return `${year}-${month}`;
}

export function isYearMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}
