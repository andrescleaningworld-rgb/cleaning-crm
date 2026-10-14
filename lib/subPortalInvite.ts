// "Invite to portal" on a sub's page (app/subcontractors/[id]): the words of
// the invite, in one place for the text message, Copy, the printed sheet and
// the email (lib/subPortalInviteEmail.ts). English, then Spanish, then
// Portuguese. Plain TS with no server imports, so the page can use it too.
//
// Subs log in to the sub portal with just their email; nothing here changes
// that. Each invite is written to the audit log (activity_log, entity type
// SUB_INVITE_ENTITY, the sub's id) so the office can see who was invited.

/** Where a sub logs in. Public; app/subcontractor-portal. */
export const SUB_PORTAL_PATH = "/subcontractor-portal";

export const SUB_INVITE_ENTITY = "sub-portal-invite";

export type InviteMethod = "text" | "copy" | "print" | "email";

export const INVITE_METHOD_LABEL: Record<InviteMethod, string> = {
  text: "text",
  copy: "copied invite",
  print: "printed QR",
  email: "email",
};

export const isInviteMethod = (value: unknown): value is InviteMethod => typeof value === "string" && value in INVITE_METHOD_LABEL;

export type InviteLanguage = { title: string; login: (email: string) => string; steps: string[]; questions: string; button: string };

export const INVITE_LANGUAGES: InviteLanguage[] = [
  {
    title: "Cleaning World – Sub Portal",
    login: (email) => `Log in with your email: ${email}`,
    steps: ["Upload photos of your visits", "Report a problem at an account", "See and finish extra jobs", "Order supplies"],
    questions: "Questions? Call your Cleaning World manager.",
    button: "Open your portal",
  },
  {
    title: "Cleaning World – Portal de Subcontratistas",
    login: (email) => `Inicia sesión con tu correo: ${email}`,
    steps: ["Sube fotos de tus visitas", "Reporta un problema en una cuenta", "Ve y completa trabajos extra", "Pide suministros"],
    questions: "¿Preguntas? Llama a tu gerente de Cleaning World.",
    button: "Abrir tu portal",
  },
  {
    title: "Cleaning World – Portal de Subcontratados",
    login: (email) => `Entre com o seu e-mail: ${email}`,
    steps: ["Envie fotos das suas visitas", "Informe um problema em uma conta", "Veja e conclua trabalhos extras", "Peça suprimentos"],
    questions: "Dúvidas? Ligue para o seu gerente da Cleaning World.",
    button: "Abrir o seu portal",
  },
];

/** The invite as plain text: the link once at the top, then each language. Used for Text, Copy and the email's text version. */
export function subInviteText(url: string, email: string): string {
  const blocks = INVITE_LANGUAGES.map((lang) => [lang.title, lang.login(email), ...lang.steps.map((step) => `• ${step}`), lang.questions].join("\n"));
  return [url, "", blocks.join("\n\n")].join("\n");
}

/** What the audit log says, e.g. "Invited to the sub portal by email". */
export function inviteDetail(method: InviteMethod): string {
  return `Invited to the sub portal by ${INVITE_METHOD_LABEL[method]}`;
}

/** The method back out of an audit-log line; null when it is not an invite line. */
export function inviteMethodOf(detail: string | null): InviteMethod | null {
  const label = /^Invited to the sub portal by (.+)$/.exec(detail ?? "")?.[1];
  const found = (Object.entries(INVITE_METHOD_LABEL) as [InviteMethod, string][]).find(([, text]) => text === label);
  return found ? found[0] : null;
}

/** One invite as the office sees it under the button. */
export type InviteRecord = { at: string; by: string; method: InviteMethod };
