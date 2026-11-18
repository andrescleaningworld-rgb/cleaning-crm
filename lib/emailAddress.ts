// One email address, as the account's Email box must hold it: customer
// emails (check-ins, the portal login, "It's fixed") go to exactly this, so
// a stray character ("dan@company.com>"), two addresses or a name around it
// makes them fail. Safe in the browser and on the server.

const PLAIN_EMAIL = /^[^@\s,;<>()"]+@[^@\s,;<>()"']+\.[^@\s,;<>()"'.]{2,}$/;

/** True for one plain address ("name@company.com"). */
export const isPlainEmail = (value: string) => PLAIN_EMAIL.test(value.trim());

/** Why an account email cannot be saved, or "" when it is fine (empty is fine). */
export function accountEmailProblem(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text || isPlainEmail(text)) return "";
  if (/[,;]/.test(text) || (text.match(/@/g) ?? []).length > 1) return "Email: put one address only (add the others as contacts).";
  return `Email: "${text}" is not one plain address, like name@company.com. Check for extra characters.`;
}
