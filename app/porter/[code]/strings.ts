// EN/ES labels for the crew-facing Crew Link page (docs/crew-link-spec.md).
// Language follows the device, with the same flag toggle as Team Hub.
import type { TeamHubLang } from "@/app/team-hub/teamHubStrings";

export const CREW_LINK_STRINGS = {
  en: {
    appName: "Crew Link",
    loading: "Loading…",
    unavailableTitle: "Crew Link unavailable",
    unavailableBody: "This link is not currently active. Contact your manager for an updated link.",
    yourName: "Your name",
    typeNameFirst: "Type your name first",
    checklist: "Checklist",
    orderSupplies: "Order supplies",
    reportProblem: "Report a problem",
    back: "Back",
    progress: (done: number, total: number) => `${done} of ${total} complete`,
    name: "Name",
    weekOf: "Week Of",
    timeIn: "Time In",
    timeOut: "Time Out",
    optionalNote: "Optional note…",
    generalNotes: "General Notes",
    generalNotesPlaceholder: "Anything else to report…",
    submit: "Submit Checklist",
    submitting: "Submitting…",
    pleaseEnterName: "Please enter your name.",
    submittedTitle: "Checklist Submitted",
    submittedBody: (name: string, location: string) => `Thanks, ${name} — your checklist for ${location} has been recorded.`,
    backHome: "Back to Crew Link",
    defaultTitle: "Cleaning Checklist",
  },
  es: {
    appName: "Crew Link",
    loading: "Cargando…",
    unavailableTitle: "Crew Link no disponible",
    unavailableBody: "Este enlace no está activo. Pide a tu supervisor un enlace nuevo.",
    yourName: "Tu nombre",
    typeNameFirst: "Escribe tu nombre primero",
    checklist: "Lista de limpieza",
    orderSupplies: "Pedir suministros",
    reportProblem: "Reportar un problema",
    back: "Atrás",
    progress: (done: number, total: number) => `${done} de ${total} completados`,
    name: "Nombre",
    weekOf: "Semana de",
    timeIn: "Hora de entrada",
    timeOut: "Hora de salida",
    optionalNote: "Nota opcional…",
    generalNotes: "Notas generales",
    generalNotesPlaceholder: "¿Algo más que reportar?…",
    submit: "Enviar lista",
    submitting: "Enviando…",
    pleaseEnterName: "Por favor escribe tu nombre.",
    submittedTitle: "Lista enviada",
    submittedBody: (name: string, location: string) => `Gracias, ${name} — tu lista para ${location} quedó registrada.`,
    backHome: "Volver a Crew Link",
    defaultTitle: "Lista de limpieza",
  },
} as const;

export function crewLinkStrings(lang: TeamHubLang) {
  return CREW_LINK_STRINGS[lang];
}
