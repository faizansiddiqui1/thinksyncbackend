/**
 * getGoogleApiKey(tenantId)
 * - If tenantId provided, try to read tenant-specific key from env map (JSON)
 * - Fallback to process.env.GOOGLE_API_KEY
 *
 * Configure multi-tenant keys by setting env: GOOGLE_KEYS_JSON='{"tenantA":"KEY1","tenantB":"KEY2"}'
 */
export const getGoogleApiKey = (tenantId = null) => {
  if (tenantId) {
    try {
      const json = process.env.GOOGLE_API_KEY || null;
      if (json) {
        const map = JSON.parse(json);
        if (map && map[tenantId]) return map[tenantId];
      }
    } catch (err) {
      // ignore malformed JSON and fallback
    }
  }
  return process.env.GOOGLE_API_KEY || null;
} 
  