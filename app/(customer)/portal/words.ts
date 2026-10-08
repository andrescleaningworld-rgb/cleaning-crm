// Every word the new customer portal shows, in English and Spanish.
// Plain words, short sentences. What is sent to staff (issue types, request
// types) stays in English so Portal Requests reads the same as before.

export type PortalLang = "en" | "es";
export const PORTAL_LANG_COOKIE = "portal_lang";

const en = {
  brand: "Cleaning World",
  language: "Español",
  back: "Back",
  home: "Home",
  logOut: "Log out",
  loading: "Loading…",
  tryAgain: "Try again",
  somethingWrong: "Something went wrong. Please try again.",
  optional: "optional",

  // login
  loginTitle: "Customer Portal",
  loginText: "Log in with your email and password.",
  email: "Email",
  emailHint: "The email Cleaning World has for your account.",
  password: "Password",
  showPassword: "Show password",
  hidePassword: "Hide password",
  logIn: "Log in",
  loggingIn: "Logging in…",
  firstTime: "First time here? Set your password",
  forgot: "Forgot password?",
  wrongLogin: "That email or password is not right.",
  locked: (minutes: number) => `Too many tries. Please wait ${minutes} minutes and try again.`,
  needEmail: "Type your email.",
  needPassword: "Type your password.",
  notOpen: "The portal is not open yet. Please call Cleaning World.",

  // set / forgot password
  firstTitle: "Set your password",
  firstText: "Type your email. We will send you a link to choose your password.",
  forgotTitle: "Forgot password",
  forgotText: "Type your email. We will send you a link to choose a new password.",
  sendLink: "Send me the link",
  sending: "Sending…",
  linkSentTitle: "Check your email",
  linkSentText: "If that email is on a Cleaning World account, a link is on its way. It works for 24 hours.",
  testLinkTitle: "Test account",
  testLinkText: "Emails are not sent here. This is the link the email would carry:",
  openLink: "Open the link",
  backToLogin: "Back to log in",
  chooseTitle: "Choose your password",
  chooseText: (email: string) => `For ${email}`,
  newPassword: "New password",
  passwordHint: "At least 8 characters.",
  passwordShort: "The password needs at least 8 characters.",
  savePassword: "Save password",
  saving: "Saving…",
  linkBadTitle: "This link does not work",
  linkBadText: "It was already used, or it is more than 24 hours old. Ask for a new one.",
  askNewLink: "Send me a new link",

  // locations
  whichLocation: "Which location?",
  whichLocationText: "Tap the place you want to see.",
  switchLocation: "Switch location",

  // home
  hello: "Hello",
  nextCleaning: "Next cleaning",
  noNextCleaning: "No cleaning is scheduled yet.",
  pastVisits: "Past visits",
  reportProblem: "Report a problem",
  extraService: "Ask for extra service",
  changeDate: "Change a date",
  billingQuestion: "Billing question",
  contactUs: "Call or text us",
  myRequests: "My requests",
  testBanner: "Test account. Nothing here is a real customer.",

  // next cleanings
  nextTitle: "Next cleanings",
  moved: "Moved",
  windows: { Morning: "Morning", Midday: "Midday", Afternoon: "Afternoon", Evening: "Evening" } as Record<string, string>,
  needOtherDay: "Need a different day?",

  // past visits
  visitsTitle: "Past visits",
  noVisits: "No visits on record yet.",
  cleaningVisit: "Cleaning",
  checkVisit: "Quality check",

  // forms
  send: "Send",
  sendingForm: "Sending…",
  problemTitle: "Report a problem",
  problemKind: "What happened?",
  pickOne: "Pick one",
  problemKinds: {
    "Missed Cleaning": "Cleaning was missed",
    "Quality Issue": "Something was not cleaned well",
    "Staff Conduct": "A problem with a person",
    "Damaged Property": "Something was damaged",
    "Communication Issue": "Nobody answered me",
    Other: "Something else",
  } as Record<string, string>,
  problemDetails: "Tell us what happened",
  problemDate: "What day?",
  photos: "Photos",
  needKind: "Pick what happened.",
  needDetails: "Tell us a little more.",
  uploadingPhotos: "Sending photos…",

  serviceTitle: "Ask for extra service",
  serviceText: "Tap what you would like. We will send you a price.",
  noServices: "Tell us what you need below.",
  serviceDetails: "Anything we should know?",
  serviceDate: "When would you like it?",
  needService: "Pick a service, or tell us what you need.",

  dateTitle: "Change a date",
  dateWhich: "Which cleaning?",
  dateOther: "Another day",
  dateCurrent: "The day to change",
  dateNew: "The new day",
  dateReason: "Why? (helps us plan)",
  needDates: "Pick the day to change and the new day.",

  billingTitle: "Billing question",
  billingKind: "What is it about?",
  billingKinds: {
    "Invoice Copy": "I need a copy of an invoice",
    "Payment Question": "A question about a payment",
    "Update Billing Information": "Change my billing details",
    "Billing Dispute": "I think a charge is wrong",
    "Payment Confirmation": "Did you get my payment?",
    Other: "Something else",
  } as Record<string, string>,
  billingDetails: "Tell us more",
  needBillingKind: "Pick what it is about.",

  // sent
  sentTitle: "Sent ✓",
  sentText: "We'll get back to you.",
  seeRequests: "See my requests",
  backHome: "Back to home",

  // my requests
  requestsTitle: "My requests",
  noRequests: "You have not sent anything yet.",
  kinds: { problem: "Problem", service: "Extra service", date: "Date change", billing: "Billing question" } as Record<string, string>,
  states: { received: "Received", working: "Working on it", done: "Done" } as Record<string, string>,

  // contact
  contactTitle: "Call or text us",
  yourManager: "Your manager",
  call: "Call",
  text: "Text",
  emailOffice: "Email the office",
  noPhone: "Email the office and we will call you back.",
};

export type PortalWords = typeof en;

const es: PortalWords = {
  brand: "Cleaning World",
  language: "English",
  back: "Atrás",
  home: "Inicio",
  logOut: "Salir",
  loading: "Cargando…",
  tryAgain: "Intentar otra vez",
  somethingWrong: "Algo salió mal. Por favor intente otra vez.",
  optional: "opcional",

  loginTitle: "Portal de Clientes",
  loginText: "Entre con su correo y su contraseña.",
  email: "Correo electrónico",
  emailHint: "El correo que Cleaning World tiene para su cuenta.",
  password: "Contraseña",
  showPassword: "Mostrar contraseña",
  hidePassword: "Ocultar contraseña",
  logIn: "Entrar",
  loggingIn: "Entrando…",
  firstTime: "¿Primera vez? Elija su contraseña",
  forgot: "¿Olvidó su contraseña?",
  wrongLogin: "Ese correo o esa contraseña no es correcto.",
  locked: (minutes: number) => `Demasiados intentos. Espere ${minutes} minutos e intente otra vez.`,
  needEmail: "Escriba su correo.",
  needPassword: "Escriba su contraseña.",
  notOpen: "El portal todavía no está abierto. Por favor llame a Cleaning World.",

  firstTitle: "Elija su contraseña",
  firstText: "Escriba su correo. Le enviaremos un enlace para elegir su contraseña.",
  forgotTitle: "Olvidé mi contraseña",
  forgotText: "Escriba su correo. Le enviaremos un enlace para elegir una contraseña nueva.",
  sendLink: "Enviarme el enlace",
  sending: "Enviando…",
  linkSentTitle: "Revise su correo",
  linkSentText: "Si ese correo está en una cuenta de Cleaning World, el enlace va en camino. Funciona por 24 horas.",
  testLinkTitle: "Cuenta de prueba",
  testLinkText: "Aquí no se envían correos. Este es el enlace que llevaría el correo:",
  openLink: "Abrir el enlace",
  backToLogin: "Volver a entrar",
  chooseTitle: "Elija su contraseña",
  chooseText: (email: string) => `Para ${email}`,
  newPassword: "Contraseña nueva",
  passwordHint: "Por lo menos 8 caracteres.",
  passwordShort: "La contraseña necesita por lo menos 8 caracteres.",
  savePassword: "Guardar contraseña",
  saving: "Guardando…",
  linkBadTitle: "Este enlace no funciona",
  linkBadText: "Ya se usó, o tiene más de 24 horas. Pida uno nuevo.",
  askNewLink: "Enviarme un enlace nuevo",

  whichLocation: "¿Cuál lugar?",
  whichLocationText: "Toque el lugar que quiere ver.",
  switchLocation: "Cambiar de lugar",

  hello: "Hola",
  nextCleaning: "Próxima limpieza",
  noNextCleaning: "Todavía no hay una limpieza programada.",
  pastVisits: "Visitas pasadas",
  reportProblem: "Reportar un problema",
  extraService: "Pedir un servicio extra",
  changeDate: "Cambiar una fecha",
  billingQuestion: "Pregunta de facturación",
  contactUs: "Llámenos o envíe un texto",
  myRequests: "Mis solicitudes",
  testBanner: "Cuenta de prueba. Nada aquí es de un cliente real.",

  nextTitle: "Próximas limpiezas",
  moved: "Cambiada",
  windows: { Morning: "Mañana", Midday: "Mediodía", Afternoon: "Tarde", Evening: "Noche" },
  needOtherDay: "¿Necesita otro día?",

  visitsTitle: "Visitas pasadas",
  noVisits: "Todavía no hay visitas registradas.",
  cleaningVisit: "Limpieza",
  checkVisit: "Revisión de calidad",

  send: "Enviar",
  sendingForm: "Enviando…",
  problemTitle: "Reportar un problema",
  problemKind: "¿Qué pasó?",
  pickOne: "Elija uno",
  problemKinds: {
    "Missed Cleaning": "No se hizo la limpieza",
    "Quality Issue": "Algo no quedó bien limpio",
    "Staff Conduct": "Un problema con una persona",
    "Damaged Property": "Algo se dañó",
    "Communication Issue": "Nadie me contestó",
    Other: "Otra cosa",
  },
  problemDetails: "Cuéntenos qué pasó",
  problemDate: "¿Qué día?",
  photos: "Fotos",
  needKind: "Elija qué pasó.",
  needDetails: "Cuéntenos un poco más.",
  uploadingPhotos: "Enviando fotos…",

  serviceTitle: "Pedir un servicio extra",
  serviceText: "Toque lo que le gustaría. Le enviaremos un precio.",
  noServices: "Cuéntenos abajo lo que necesita.",
  serviceDetails: "¿Algo que debamos saber?",
  serviceDate: "¿Cuándo lo quiere?",
  needService: "Elija un servicio, o cuéntenos lo que necesita.",

  dateTitle: "Cambiar una fecha",
  dateWhich: "¿Cuál limpieza?",
  dateOther: "Otro día",
  dateCurrent: "El día que quiere cambiar",
  dateNew: "El día nuevo",
  dateReason: "¿Por qué? (nos ayuda a planear)",
  needDates: "Elija el día que quiere cambiar y el día nuevo.",

  billingTitle: "Pregunta de facturación",
  billingKind: "¿De qué se trata?",
  billingKinds: {
    "Invoice Copy": "Necesito una copia de una factura",
    "Payment Question": "Una pregunta sobre un pago",
    "Update Billing Information": "Cambiar mis datos de facturación",
    "Billing Dispute": "Creo que un cobro está mal",
    "Payment Confirmation": "¿Recibieron mi pago?",
    Other: "Otra cosa",
  },
  billingDetails: "Cuéntenos más",
  needBillingKind: "Elija de qué se trata.",

  sentTitle: "Enviado ✓",
  sentText: "Le responderemos pronto.",
  seeRequests: "Ver mis solicitudes",
  backHome: "Volver al inicio",

  requestsTitle: "Mis solicitudes",
  noRequests: "Todavía no ha enviado nada.",
  kinds: { problem: "Problema", service: "Servicio extra", date: "Cambio de fecha", billing: "Pregunta de facturación" },
  states: { received: "Recibido", working: "Trabajando en ello", done: "Listo" },

  contactTitle: "Llámenos o envíe un texto",
  yourManager: "Su gerente",
  call: "Llamar",
  text: "Texto",
  emailOffice: "Escribir a la oficina",
  noPhone: "Escriba a la oficina y le llamaremos.",
};

export const PORTAL_WORDS: Record<PortalLang, PortalWords> = { en, es };

export const asPortalLang = (value: unknown): PortalLang => (value === "es" ? "es" : "en");

/** "Monday, October 12" / "lunes, 12 de octubre" from YYYY-MM-DD. Other text comes back as it is. */
export function portalDay(iso: string, lang: PortalLang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", { weekday: "long", month: "long", day: "numeric" }).format(date);
}
