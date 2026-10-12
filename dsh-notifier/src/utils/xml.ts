/**
 * Escape XML special characters and strip illegal control characters
 * for safely injecting into WinRT Toast XML templates.
 */
export function escapeXml(text: string): string {
  if (typeof text !== 'string') {
    text = String(text ?? '');
  }
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
