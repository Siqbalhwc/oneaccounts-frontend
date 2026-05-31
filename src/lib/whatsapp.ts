/**
 * Normalizes a Pakistani phone number to the format needed for wa.me links.
 * Removes extra leading zeros, existing 92/0092 prefixes, and non-digit characters.
 * Returns the local number without country code.
 */
export function normalizePhone(raw: string): string {
  let cleaned = raw.replace(/\D/g, '')        // remove everything except digits
  cleaned = cleaned.replace(/^0+/, '')        // strip leading zeros
  cleaned = cleaned.replace(/^(00)?92/, '')   // strip existing country code
  return cleaned
}

/**
 * Builds a WhatsApp URL for the given raw phone number and optional message.
 */
export function getWhatsAppLink(rawPhone: string, message: string): string {
  const phone = normalizePhone(rawPhone)
  if (!phone) return ''
  return `https://wa.me/92${phone}?text=${encodeURIComponent(message)}`
}