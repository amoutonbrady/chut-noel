const DAY_MS = 86_400_000;

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "aujourd'hui", "hier", "il y a 3 jours", then "le 12 nov." (year added when not this year). */
export function formatAgo(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  // Calendar days, rounded so DST's 23h/25h days still count as one
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} jours`;
  const sameYear = date.getFullYear() === now.getFullYear();
  return `le ${date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  })}`;
}

/** "Ajoutée hier, modifiée aujourd'hui": the edit part only when it really changed. */
export function itemDates(createdAt: string, updatedAt: string, now = new Date()): string {
  const added = formatAgo(createdAt, now);
  if (!added) return "";
  const edited =
    Date.parse(updatedAt) - Date.parse(createdAt) > 60_000
      ? `, modifiée ${formatAgo(updatedAt, now)}`
      : "";
  return `Ajoutée ${added}${edited}`;
}
