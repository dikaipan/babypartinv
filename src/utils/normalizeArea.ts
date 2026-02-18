/**
 * Normalize area group string to UPPERCASE for consistent grouping.
 * e.g. "bekasi" → "BEKASI", "Bengkulu" → "BENGKULU"
 */
export function normalizeArea(input: string): string {
    return input.trim().toUpperCase();
}
