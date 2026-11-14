// Some older messages contain UTF-8 bytes interpreted as Latin-1.
export function notificationText(value: string, fallback: string): string {
  if (!value || /\uFFFD/.test(value)) return fallback;
  if (/^[\x00-\xff]+$/.test(value) && /[\xc2-\xf4][\x80-\xbf]/.test(value)) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(value, (c) => c.charCodeAt(0)),
      );
    } catch {
      return value;
    }
  }
  return value;
}
