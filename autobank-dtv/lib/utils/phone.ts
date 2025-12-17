export function normalizeTelefonoPrincipal(phone: string): string {
    // Remove everything except digits
    const digits = phone.replace(/\D/g, "");
  
    // Case 1: already looks like AR mobile with 549 prefix (13 digits)
    // e.g. "5491138436086" -> "+5491138436086"
    if (digits.startsWith("549") && digits.length === 13) {
      return `+${digits}`;
    }
  
    // Case 2:  AR number as 54 + area + number (missing "9")
    // e.g. "541138436086" -> "+5491138436086"
    if (digits.startsWith("54") && digits.length === 12) {
      const rest = digits.slice(2); // drop "54"
      return `+549${rest}`;
    }
  
    // Fallbacks: just ensure we have "+" + digits
    if (!digits) {
      return phone;
    }
  
    return `+${digits}`;
  }