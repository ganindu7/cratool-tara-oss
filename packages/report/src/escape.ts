// Making text from a TARA safe to place in a web page. Everything a person typed goes through here.

/** Text as HTML text or as the value of an attribute. Control characters are dropped. */
export function escapeHtml(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what is being removed
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Escaped text with its line breaks kept. */
export const escapeLines = (text: string): string => escapeHtml(text).replace(/\r?\n+/g, "<br>");

/** Finds the web addresses in a text. An address ends before the punctuation of the sentence it stands in. */
export const WEB_ADDRESS = /(https?:\/\/[^\s<>"'()]*[^\s<>"'().,;:!?])/;

/**
 * An address a link may lead to, or null. Only http and https addresses are links: a "javascript:" or "data:"
 * address typed into a field is shown as the text it is and never becomes something to click.
 */
export function safeUrl(address: string): string | null {
  const trimmed = address.trim();
  return /^https?:\/\/[^\s<>"']+$/i.test(trimmed) ? trimmed : null;
}

/** A web address as shown where room is short: where it is, and the file or page it ends on. The link itself keeps all of it. */
export function shortAddress(address: string): string {
  const match = /^https?:\/\/(?:www\.)?([^/?#]+)([^?#]*)(.*)$/.exec(address);
  if (!match) return address;
  const host = match[1] as string;
  const path = match[2] as string;
  const rest = match[3] as string;
  const parts = path.split("/").filter(Boolean);
  const tail = rest.length <= 24 ? rest : `${rest.slice(0, 22)}…`;
  const whole = `${host}${path}${tail}`;
  if (whole.length <= 44 || parts.length <= 1) return whole.length <= 60 ? whole : `${whole.slice(0, 58)}…`;
  return `${host}/…/${parts.at(-1)}${tail}`;
}

/** A name for an anchor made from an ID: letters, digits and hyphens. */
export const anchorName = (id: string): string => `rec-${id.replace(/[^A-Za-z0-9]+/g, "-")}`;
