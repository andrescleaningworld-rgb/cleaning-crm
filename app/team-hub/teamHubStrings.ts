// Simplicity pass (docs/team-hub-spec.md "GLOBAL RULES"): "Language
// follows the phone (EN/ES) with a small flag icon to switch." Plain
// nested-object dictionary, not a full i18n library — this app has a
// small, fixed set of screens, so a library would be more code than the
// strings themselves. useTeamHubLang() detects navigator.language once,
// then lets the flag icon override it for the rest of the session
// (localStorage, best-effort — see its own comment).
"use client";

import { useCallback, useEffect, useState } from "react";

export type TeamHubLang = "en" | "es";

const STORAGE_KEY = "team-hub-lang";

export const TEAM_HUB_STRINGS = {
  en: {
    common: {
      loading: "Loading…",
      notYou: "Not you?",
      signedInAs: "Signed in as",
      today: "Today",
      noSignalSaved: "No signal — saved, will send later",
      somethingWrong: "Something went wrong. Try again.",
      linkNotActive: "This link isn't active anymore. Ask your office for a new one.",
      back: "Back",
    },
    install: {
      hint: "Add this to your Home Screen for quick access",
      iosSteps: "Tap Share, then Add to Home Screen",
      androidSteps: "Tap ⋮, then Add to Home screen",
      otherSteps: "Open this link on your phone to add it",
      gotIt: "Got it",
    },
    login: {
      whoIsSigningIn: "Who's working today?",
      enterPin: "Enter your PIN",
      noWorkers: "No one is set up yet. Ask your office.",
      wrongPin: "Wrong PIN",
      lockedOut: "Too many tries. Wait a few minutes.",
    },
    today: {
      noModules: "Nothing set up yet. Ask your office.",
      comingSoon: "Coming soon",
      checklistDone: (done: number, total: number) => `${done} of ${total} done`,
      checklistNotStarted: "Not started",
      checklistAllDone: "All done",
      roundCheckNow: (name: string) => `${name} — check now`,
      roundAgo: (name: string, ago: string) => `${name} — ${ago}`,
      roundsAllChecked: "All checked",
      newNote: "1 new note",
    },
    modules: {
      checklist: "Checklist",
      rounds: "Checks",
      handoff: "Notes for other shift",
      requests: "Tasks",
      supplies: "Order supplies",
      issues: "Report a problem",
    },
    checklist: {
      area: (n: number, total: number) => `Area ${n} of ${total}`,
      nextArea: "Next area",
      finish: "Finish",
      startChecklist: "Start checklist",
      starting: "Starting…",
      finishing: "Finishing…",
      submitted: "Nice work — checklist submitted.",
      allDoneHere: "All done here",
      reportProblem: "Report a problem",
      reportProblemPlaceholder: "What's wrong?",
      send: "Send",
      cancel: "Cancel",
      problemSent: "Sent to your office.",
      noItems: "Nothing set up yet. Ask your office.",
    },
    rounds: {
      checkIn: "Check In",
      checking: "…",
      notCheckedToday: "Not checked today",
      justNow: "just now",
      minAgo: (n: number) => `${n} min ago`,
      hoursAgo: (n: number) => `${n} hr${n === 1 ? "" : "s"} ago`,
      overdue: "Overdue",
      noItems: "Nothing set up yet. Ask your office.",
      by: (name: string) => `by ${name}`,
    },
  },
  es: {
    common: {
      loading: "Cargando…",
      notYou: "¿No eres tú?",
      signedInAs: "Sesión iniciada como",
      today: "Hoy",
      noSignalSaved: "Sin señal — guardado, se enviará después",
      somethingWrong: "Algo salió mal. Intenta de nuevo.",
      linkNotActive: "Este enlace ya no está activo. Pide uno nuevo en tu oficina.",
      back: "Atrás",
    },
    install: {
      hint: "Agrega esto a tu pantalla de inicio para acceso rápido",
      iosSteps: "Toca Compartir, luego Agregar a inicio",
      androidSteps: "Toca ⋮, luego Agregar a pantalla de inicio",
      otherSteps: "Abre este enlace en tu teléfono para agregarlo",
      gotIt: "Entendido",
    },
    login: {
      whoIsSigningIn: "¿Quién trabaja hoy?",
      enterPin: "Escribe tu PIN",
      noWorkers: "Nadie está configurado todavía. Pregunta en tu oficina.",
      wrongPin: "PIN incorrecto",
      lockedOut: "Demasiados intentos. Espera unos minutos.",
    },
    today: {
      noModules: "Nada configurado todavía. Pregunta en tu oficina.",
      comingSoon: "Próximamente",
      checklistDone: (done: number, total: number) => `${done} de ${total} hechos`,
      checklistNotStarted: "Sin empezar",
      checklistAllDone: "Todo hecho",
      roundCheckNow: (name: string) => `${name} — revisar ahora`,
      roundAgo: (name: string, ago: string) => `${name} — ${ago}`,
      roundsAllChecked: "Todo revisado",
      newNote: "1 nota nueva",
    },
    modules: {
      checklist: "Lista de tareas",
      rounds: "Revisiones",
      handoff: "Notas para el otro turno",
      requests: "Tareas especiales",
      supplies: "Pedir suministros",
      issues: "Reportar un problema",
    },
    checklist: {
      area: (n: number, total: number) => `Área ${n} de ${total}`,
      nextArea: "Siguiente área",
      finish: "Terminar",
      startChecklist: "Empezar lista",
      starting: "Empezando…",
      finishing: "Terminando…",
      submitted: "Buen trabajo — lista enviada.",
      allDoneHere: "Todo hecho aquí",
      reportProblem: "Reportar un problema",
      reportProblemPlaceholder: "¿Qué pasó?",
      send: "Enviar",
      cancel: "Cancelar",
      problemSent: "Enviado a tu oficina.",
      noItems: "Nada configurado todavía. Pregunta en tu oficina.",
    },
    rounds: {
      checkIn: "Revisar",
      checking: "…",
      notCheckedToday: "No revisado hoy",
      justNow: "ahora mismo",
      minAgo: (n: number) => `hace ${n} min`,
      hoursAgo: (n: number) => `hace ${n} hr${n === 1 ? "" : "s"}`,
      overdue: "Atrasado",
      noItems: "Nada configurado todavía. Pregunta en tu oficina.",
      by: (name: string) => `por ${name}`,
    },
  },
} as const;

export function detectTeamHubLang(): TeamHubLang {
  if (typeof navigator === "undefined") return "en";
  return navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

// Per-viewer convenience only (which flag they last picked) — never read
// back by the server, never shared between devices. Wrapped in try/catch
// per the artifact/browser-storage convention: private browsing or blocked
// site data can throw or silently no-op.
export function useTeamHubLang(): [TeamHubLang, (lang: TeamHubLang) => void] {
  const [lang, setLangState] = useState<TeamHubLang>("en");

  useEffect(() => {
    // Deferred read: localStorage/navigator.language aren't available
    // during SSR, so reading them eagerly (lazy initializer) would mismatch
    // the server-rendered "en" strings.
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "es") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLangState(stored);
        return;
      }
    } catch {
      // fall through to phone-language detection
    }
    setLangState(detectTeamHubLang());
  }, []);

  const setLang = useCallback((next: TeamHubLang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // best-effort only — the picked language still applies for this load
    }
  }, []);

  return [lang, setLang];
}

export function teamHubStrings(lang: TeamHubLang) {
  return TEAM_HUB_STRINGS[lang];
}
