export function formatIsoDateToDmy(isoDate: string): string {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

/**
 * Formatea una fecha/hora ISO a formato local de Argentina (DD/MM/YYYY HH:MM)
 */
export function formatDateTimeArgentina(isoDateTime: string): string {
  if (!isoDateTime) return "";
  try {
    const date = new Date(isoDateTime);
    // Usar locale de Argentina (es-AR) para formato local
    return date.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires",
    });
  } catch (error) {
    return isoDateTime;
  }
}

/**
 * Formatea duración en segundos a formato MM:SS
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}
