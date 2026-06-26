"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Language = "en" | "es" | "pt";
type UserRole = "admin" | "subcontractor" | null;

type HelpSection = {
  title: string;
  description: string;
  items: string[];
};

function getStoredRole(): UserRole {
  if (typeof window === "undefined") return null;

  const role = window.localStorage.getItem("cwRole");

  if (role === "admin") return "admin";
  if (role === "subcontractor") return "subcontractor";

  return null;
}

const content: Record<
  Language,
  {
    eyebrow: string;
    title: string;
    subtitle: string;
    aboutTitle: string;
    aboutDescription: string;
    aboutAdminTitle: string;
    aboutAdminText: string;
    aboutSubTitle: string;
    aboutSubText: string;
    aboutImportantTitle: string;
    aboutImportantText: string;
    quickStartTitle: string;
    quickStartItems: string[];
    adminTitle: string;
    subTitle: string;
    footerNote: string;
    adminSections: HelpSection[];
    subSections: HelpSection[];
  }
> = {
  en: {
    eyebrow: "Cleaning World Help",
    title: "Help & About",
    subtitle:
      "Use this page as a quick guide for the Cleaning World Operations & Quality App.",
    aboutTitle: "About This App",
    aboutDescription:
      "The Cleaning World Operations & Quality App helps the office track accounts, visits, complaints, subcontractors, supplies, photos, reports, transfer proposals, and follow-ups in one place.",
    aboutAdminTitle: "For Admin Users",
    aboutAdminText:
      "The admin side is for Cleaning World office and management users. Admin users can manage accounts, visits, complaints, subcontractors, transfer proposals, supplies, reports, maps, and internal tasks.",
    aboutSubTitle: "For Subcontractors",
    aboutSubText:
      "The subcontractor side is for viewing assigned accounts, reporting issues, uploading photos, requesting supplies, and communicating important account problems to the office.",
    aboutImportantTitle: "Important",
    aboutImportantText:
      "This app is for Cleaning World work use only. Do not share login information. Only enter accurate information related to accounts, visits, complaints, supplies, photos, or assigned work.",
    quickStartTitle: "Quick Start",
    quickStartItems: [
      "Use the top menu to move between pages.",
      "Click an account name to see full account details.",
      "Use filters and search boxes to find information faster.",
      "Save important notes as visits, complaints, or account updates.",
      "Subcontractors should only use the subcontractor portal sections.",
    ],
    adminTitle: "Admin Instructions",
    subTitle: "Subcontractor Instructions",
    footerNote:
      "Need something added to this help page? Tell the office what instruction is missing.",
    adminSections: [
      {
        title: "Dashboard",
        description:
          "Use the dashboard to see the main company overview and current activity.",
        items: [
          "Review monthly revenue, sub pay, open complaints, and visits.",
          "Use recent activity to catch problems early.",
          "Check alerts or items that need attention.",
        ],
      },
      {
        title: "Accounts",
        description:
          "Use Accounts to search, filter, and open customer account details.",
        items: [
          "Search by account name, address, manager, or subcontractor.",
          "Click an account name to open full details.",
          "Use filters for status, manager, subcontractor, revenue, and frequency.",
          "Use Transfer Proposal when moving accounts to a new subcontractor.",
        ],
      },
      {
        title: "Transfer Proposals",
        description:
          "Use this when offering accounts to a new subcontractor before changing the account assignment.",
        items: [
          "Search or filter for the accounts being transferred.",
          "Select the accounts and review the proposed monthly pay.",
          "Save the proposal before sending it.",
          "Print or email the proposal when ready.",
          "Only change the actual subcontractor after approval.",
        ],
      },
      {
        title: "Visits",
        description:
          "Use Visits to record account visits, inspections, and follow-ups.",
        items: [
          "Add visit notes after checking an account.",
          "Include the account, date, manager, and important observations.",
          "Use visits to track service quality and follow-up history.",
        ],
      },
      {
        title: "Complaints",
        description:
          "Use Complaints to track service issues and make sure they are resolved.",
        items: [
          "Add the account, complaint details, priority, and follow-up notes.",
          "Mark whether the complaint is valid, not valid, subjective, or needs review.",
          "Use photos when available to document the issue.",
          "Follow up until the issue is closed.",
        ],
      },
      {
        title: "Account Updates",
        description:
          "Use Account Updates for notes that are important but are not complaints.",
        items: [
          "Add notes for customer changes, service changes, or important conversations.",
          "Use updates to keep account history organized.",
          "Check recent updates before visiting or calling a customer.",
        ],
      },
      {
        title: "Subcontractors",
        description:
          "Use Subcontractors to manage subcontractor information and assigned accounts.",
        items: [
          "Review subcontractor contact information.",
          "Check accounts assigned to each subcontractor.",
          "Keep email and phone information updated.",
        ],
      },
      {
        title: "Supplies",
        description:
          "Use Supplies and Supply Orders to manage inventory requests.",
        items: [
          "Review new supply orders from subcontractors.",
          "Approve, deny, or update supply requests.",
          "Keep supply item descriptions and stock information updated.",
        ],
      },
      {
        title: "Map",
        description:
          "Use the map to see account locations and plan efficient routes.",
        items: [
          "Use pins to see nearby accounts.",
          "Open account details when more information is needed.",
          "Use this when planning visits or route changes.",
        ],
      },
      {
        title: "Reports",
        description:
          "Use Reports for summaries, printing, and company review.",
        items: [
          "Review started and cancelled accounts.",
          "Print reports when needed.",
          "Use reports to understand trends and account changes.",
        ],
      },
      {
        title: "To-Do List",
        description:
          "Use the To-Do List to assign and track internal tasks.",
        items: [
          "Add the task, account, due date, and reason.",
          "Use it for follow-ups, visits, complaints, and onboarding.",
          "Keep tasks clear so the assigned person knows what to do.",
        ],
      },
    ],
    subSections: [
      {
        title: "Home Button",
        description:
          "Use the Home button at the top of the app to return to your subcontractor dashboard.",
        items: [
          "If you are already logged in, Home will bring you back to your subcontractor dashboard.",
          "You do not need to log in again unless you logged out, cleared your browser, or are using a different phone.",
          "Use Home instead of using the browser back button when you want to return to your main subcontractor page.",
        ],
      },
      {
        title: "My Accounts",
        description:
          "Use My Accounts to see the accounts currently assigned to you.",
        items: [
          "Review account name, address, schedule, and important details.",
          "Open an account when you need more information.",
          "Contact the office if account information looks incorrect.",
        ],
      },
      {
        title: "Report Issue",
        description:
          "Use Report Issue when something is wrong at an account.",
        items: [
          "Choose the account.",
          "Describe the issue clearly.",
          "Add photos when requested or when they help explain the problem.",
          "Submit the issue so the office can review it.",
        ],
      },
      {
        title: "Supply Orders",
        description:
          "Use Supply Orders to request cleaning supplies.",
        items: [
          "Choose the account that needs supplies.",
          "Select the supply item and quantity.",
          "Choose pickup or delivery.",
          "Use Other / Not Listed if the supply is not in the list.",
        ],
      },
      {
        title: "Photos",
        description:
          "Use photos to document issues, completed work, or account conditions.",
        items: [
          "Take clear photos with good lighting.",
          "Do not upload unnecessary photos.",
          "Use photos when reporting complaints, damages, or unusual conditions.",
          "Photos should open as photo previews or image view inside the Cleaning World app.",
          "Photos should not be used to browse Cleaning World Google Drive folders.",
        ],
      },
    ],
  },

  es: {
    eyebrow: "Ayuda de Cleaning World",
    title: "Ayuda y Acerca de",
    subtitle:
      "Use esta página como una guía rápida para la aplicación de Operaciones y Calidad de Cleaning World.",
    aboutTitle: "Acerca de Esta Aplicación",
    aboutDescription:
      "La aplicación de Operaciones y Calidad de Cleaning World ayuda a la oficina a manejar cuentas, visitas, quejas, subcontratistas, suministros, fotos, reportes, propuestas de transferencia y seguimientos en un solo lugar.",
    aboutAdminTitle: "Para Administración",
    aboutAdminText:
      "El lado administrativo es para usuarios de oficina y gerencia de Cleaning World. Los administradores pueden manejar cuentas, visitas, quejas, subcontratistas, propuestas de transferencia, suministros, reportes, mapa y tareas internas.",
    aboutSubTitle: "Para Subcontratistas",
    aboutSubText:
      "El lado de subcontratistas es para ver cuentas asignadas, reportar problemas, subir fotos, pedir suministros y comunicar problemas importantes de las cuentas a la oficina.",
    aboutImportantTitle: "Importante",
    aboutImportantText:
      "Esta aplicación es solamente para uso de trabajo de Cleaning World. No comparta información de acceso. Ingrese solamente información correcta relacionada con cuentas, visitas, quejas, suministros, fotos o trabajo asignado.",
    quickStartTitle: "Inicio Rápido",
    quickStartItems: [
      "Use el menú de arriba para moverse entre páginas.",
      "Haga clic en el nombre de una cuenta para ver los detalles completos.",
      "Use los filtros y las búsquedas para encontrar información más rápido.",
      "Guarde notas importantes como visitas, quejas o actualizaciones de cuenta.",
      "Los subcontratistas deben usar solamente las secciones del portal de subcontratistas.",
    ],
    adminTitle: "Instrucciones para Administración",
    subTitle: "Instrucciones para Subcontratistas",
    footerNote:
      "¿Falta alguna instrucción? Avise a la oficina para agregarla a esta página.",
    adminSections: [
      {
        title: "Panel Principal",
        description:
          "Use el panel principal para ver el resumen de la compañía y la actividad reciente.",
        items: [
          "Revise ingresos mensuales, pagos a subcontratistas, quejas abiertas y visitas.",
          "Use la actividad reciente para detectar problemas temprano.",
          "Revise alertas o cuentas que necesitan atención.",
        ],
      },
      {
        title: "Cuentas",
        description:
          "Use Cuentas para buscar, filtrar y abrir detalles de los clientes.",
        items: [
          "Busque por nombre de cuenta, dirección, manager o subcontratista.",
          "Haga clic en el nombre de una cuenta para abrir los detalles completos.",
          "Use filtros por estado, manager, subcontratista, ingreso y frecuencia.",
          "Use Propuesta de Transferencia cuando vaya a mover cuentas a otro subcontratista.",
        ],
      },
      {
        title: "Propuestas de Transferencia",
        description:
          "Use esto para ofrecer cuentas a un nuevo subcontratista antes de cambiar la asignación oficial.",
        items: [
          "Busque o filtre las cuentas que serán transferidas.",
          "Seleccione las cuentas y revise el pago mensual propuesto.",
          "Guarde la propuesta antes de enviarla.",
          "Imprima o envíe la propuesta por email cuando esté lista.",
          "Cambie el subcontratista oficial solo después de la aprobación.",
        ],
      },
      {
        title: "Visitas",
        description:
          "Use Visitas para registrar inspecciones, visitas y seguimientos.",
        items: [
          "Agregue notas después de revisar una cuenta.",
          "Incluya cuenta, fecha, manager y observaciones importantes.",
          "Use las visitas para llevar historial de calidad y seguimiento.",
        ],
      },
      {
        title: "Quejas",
        description:
          "Use Quejas para registrar problemas de servicio y asegurar seguimiento.",
        items: [
          "Agregue la cuenta, detalles, prioridad y notas de seguimiento.",
          "Marque si la queja es válida, no válida, subjetiva o necesita revisión.",
          "Use fotos cuando estén disponibles para documentar el problema.",
          "Haga seguimiento hasta que el problema esté cerrado.",
        ],
      },
      {
        title: "Actualizaciones de Cuenta",
        description:
          "Use Actualizaciones para notas importantes que no son quejas.",
        items: [
          "Agregue notas de cambios, conversaciones o información importante.",
          "Use actualizaciones para mantener el historial organizado.",
          "Revise actualizaciones recientes antes de visitar o llamar al cliente.",
        ],
      },
      {
        title: "Subcontratistas",
        description:
          "Use Subcontratistas para manejar información y cuentas asignadas.",
        items: [
          "Revise información de contacto del subcontratista.",
          "Revise cuentas asignadas a cada subcontratista.",
          "Mantenga email y teléfono actualizados.",
        ],
      },
      {
        title: "Suministros",
        description:
          "Use Suministros y Órdenes de Suministros para manejar pedidos.",
        items: [
          "Revise pedidos nuevos de subcontratistas.",
          "Apruebe, niegue o actualice pedidos.",
          "Mantenga descripciones e inventario actualizados.",
        ],
      },
      {
        title: "Mapa",
        description:
          "Use el mapa para ver ubicaciones y planear rutas eficientes.",
        items: [
          "Use los pines para ver cuentas cercanas.",
          "Abra detalles de cuenta cuando necesite más información.",
          "Use esto para planear visitas o cambios de ruta.",
        ],
      },
      {
        title: "Reportes",
        description:
          "Use Reportes para resúmenes, impresión y revisión de la compañía.",
        items: [
          "Revise cuentas nuevas y canceladas.",
          "Imprima reportes cuando sea necesario.",
          "Use reportes para entender cambios y tendencias.",
        ],
      },
      {
        title: "Lista de Tareas",
        description:
          "Use la Lista de Tareas para asignar y seguir trabajos internos.",
        items: [
          "Agregue tarea, cuenta, fecha límite y razón.",
          "Úselo para seguimientos, visitas, quejas y onboarding.",
          "Escriba tareas claras para que la persona asignada sepa qué hacer.",
        ],
      },
    ],
    subSections: [
      {
        title: "Botón Home",
        description:
          "Use el botón Home en la parte superior de la aplicación para regresar a su panel principal de subcontratista.",
        items: [
          "Si ya inició sesión, Home lo llevará de regreso a su panel de subcontratista.",
          "No necesita iniciar sesión otra vez a menos que haya cerrado sesión, borrado el navegador, o esté usando otro teléfono.",
          "Use Home en vez del botón de regresar del navegador cuando quiera volver a su página principal.",
        ],
      },
      {
        title: "Mis Cuentas",
        description:
          "Use Mis Cuentas para ver las cuentas asignadas a usted.",
        items: [
          "Revise nombre de cuenta, dirección, horario y detalles importantes.",
          "Abra una cuenta cuando necesite más información.",
          "Contacte a la oficina si la información no está correcta.",
        ],
      },
      {
        title: "Reportar Problema",
        description:
          "Use Reportar Problema cuando algo esté mal en una cuenta.",
        items: [
          "Seleccione la cuenta.",
          "Describa el problema claramente.",
          "Agregue fotos cuando se soliciten o ayuden a explicar el problema.",
          "Envíe el reporte para que la oficina lo revise.",
        ],
      },
      {
        title: "Pedidos de Suministros",
        description:
          "Use Pedidos de Suministros para pedir productos de limpieza.",
        items: [
          "Seleccione la cuenta que necesita suministros.",
          "Seleccione el producto y la cantidad.",
          "Seleccione recoger o entregar.",
          "Use Otro / No está en la lista si no encuentra el producto.",
        ],
      },
      {
        title: "Fotos",
        description:
          "Use fotos para documentar problemas, trabajo terminado o condiciones de la cuenta.",
        items: [
          "Tome fotos claras y con buena luz.",
          "No suba fotos innecesarias.",
          "Use fotos para quejas, daños o condiciones inusuales.",
          "Las fotos deben abrir como vista previa o imagen dentro de la aplicación de Cleaning World.",
          "Las fotos no deben usarse para navegar carpetas de Google Drive de Cleaning World.",
        ],
      },
    ],
  },

  pt: {
    eyebrow: "Ajuda Cleaning World",
    title: "Ajuda e Sobre",
    subtitle:
      "Use esta página como um guia rápido para o aplicativo de Operações e Qualidade da Cleaning World.",
    aboutTitle: "Sobre Este Aplicativo",
    aboutDescription:
      "O aplicativo de Operações e Qualidade da Cleaning World ajuda o escritório a acompanhar contas, visitas, reclamações, subcontratados, suprimentos, fotos, relatórios, propostas de transferência e acompanhamentos em um só lugar.",
    aboutAdminTitle: "Para Administração",
    aboutAdminText:
      "O lado administrativo é para usuários do escritório e gerência da Cleaning World. Administradores podem gerenciar contas, visitas, reclamações, subcontratados, propostas de transferência, suprimentos, relatórios, mapa e tarefas internas.",
    aboutSubTitle: "Para Subcontratados",
    aboutSubText:
      "O lado dos subcontratados é para ver contas atribuídas, reportar problemas, enviar fotos, pedir suprimentos e comunicar problemas importantes das contas ao escritório.",
    aboutImportantTitle: "Importante",
    aboutImportantText:
      "Este aplicativo é somente para uso de trabalho da Cleaning World. Não compartilhe informações de login. Insira somente informações corretas relacionadas a contas, visitas, reclamações, suprimentos, fotos ou trabalho atribuído.",
    quickStartTitle: "Início Rápido",
    quickStartItems: [
      "Use o menu superior para navegar entre as páginas.",
      "Clique no nome de uma conta para ver os detalhes completos.",
      "Use filtros e campos de busca para encontrar informações mais rápido.",
      "Salve notas importantes como visitas, reclamações ou atualizações de conta.",
      "Subcontratados devem usar somente as seções do portal de subcontratados.",
    ],
    adminTitle: "Instruções para Administração",
    subTitle: "Instruções para Subcontratados",
    footerNote:
      "Precisa adicionar alguma instrução? Avise o escritório sobre o que está faltando.",
    adminSections: [
      {
        title: "Painel Principal",
        description:
          "Use o painel para ver o resumo da empresa e a atividade atual.",
        items: [
          "Revise receita mensal, pagamento dos subcontratados, reclamações abertas e visitas.",
          "Use a atividade recente para encontrar problemas cedo.",
          "Verifique alertas ou contas que precisam de atenção.",
        ],
      },
      {
        title: "Contas",
        description:
          "Use Contas para buscar, filtrar e abrir detalhes dos clientes.",
        items: [
          "Busque por nome da conta, endereço, gerente ou subcontratado.",
          "Clique no nome da conta para abrir os detalhes completos.",
          "Use filtros por status, gerente, subcontratado, receita e frequência.",
          "Use Proposta de Transferência quando mover contas para outro subcontratado.",
        ],
      },
      {
        title: "Propostas de Transferência",
        description:
          "Use isso para oferecer contas a um novo subcontratado antes de mudar a atribuição oficial.",
        items: [
          "Busque ou filtre as contas que serão transferidas.",
          "Selecione as contas e revise o pagamento mensal proposto.",
          "Salve a proposta antes de enviar.",
          "Imprima ou envie a proposta por email quando estiver pronta.",
          "Mude o subcontratado oficial somente depois da aprovação.",
        ],
      },
      {
        title: "Visitas",
        description:
          "Use Visitas para registrar inspeções, visitas e acompanhamentos.",
        items: [
          "Adicione notas depois de verificar uma conta.",
          "Inclua conta, data, gerente e observações importantes.",
          "Use visitas para acompanhar qualidade e histórico.",
        ],
      },
      {
        title: "Reclamações",
        description:
          "Use Reclamações para acompanhar problemas de serviço e garantir solução.",
        items: [
          "Adicione conta, detalhes, prioridade e notas de acompanhamento.",
          "Marque se a reclamação é válida, não válida, subjetiva ou precisa revisão.",
          "Use fotos quando possível para documentar o problema.",
          "Acompanhe até que o problema seja fechado.",
        ],
      },
      {
        title: "Atualizações de Conta",
        description:
          "Use Atualizações para notas importantes que não são reclamações.",
        items: [
          "Adicione notas sobre mudanças, conversas ou informações importantes.",
          "Use atualizações para manter o histórico organizado.",
          "Revise atualizações recentes antes de visitar ou ligar para o cliente.",
        ],
      },
      {
        title: "Subcontratados",
        description:
          "Use Subcontratados para gerenciar informações e contas atribuídas.",
        items: [
          "Revise informações de contato.",
          "Verifique contas atribuídas a cada subcontratado.",
          "Mantenha email e telefone atualizados.",
        ],
      },
      {
        title: "Suprimentos",
        description:
          "Use Suprimentos e Pedidos de Suprimentos para gerenciar pedidos.",
        items: [
          "Revise novos pedidos dos subcontratados.",
          "Aprove, negue ou atualize pedidos.",
          "Mantenha descrições e estoque atualizados.",
        ],
      },
      {
        title: "Mapa",
        description:
          "Use o mapa para ver locais das contas e planejar rotas eficientes.",
        items: [
          "Use os pinos para ver contas próximas.",
          "Abra detalhes da conta quando precisar de mais informações.",
          "Use isso para planejar visitas ou mudanças de rota.",
        ],
      },
      {
        title: "Relatórios",
        description:
          "Use Relatórios para resumos, impressão e revisão da empresa.",
        items: [
          "Revise contas iniciadas e canceladas.",
          "Imprima relatórios quando necessário.",
          "Use relatórios para entender mudanças e tendências.",
        ],
      },
      {
        title: "Lista de Tarefas",
        description:
          "Use a Lista de Tarefas para atribuir e acompanhar tarefas internas.",
        items: [
          "Adicione tarefa, conta, prazo e motivo.",
          "Use para acompanhamentos, visitas, reclamações e onboarding.",
          "Escreva tarefas claras para que a pessoa designada saiba o que fazer.",
        ],
      },
    ],
    subSections: [
      {
        title: "Botão Home",
        description:
          "Use o botão Home no topo do aplicativo para voltar ao painel principal do subcontratado.",
        items: [
          "Se você já fez login, Home levará você de volta ao painel do subcontratado.",
          "Você não precisa fazer login novamente, a menos que tenha saído, limpado o navegador, ou esteja usando outro telefone.",
          "Use Home em vez do botão voltar do navegador quando quiser retornar à página principal.",
        ],
      },
      {
        title: "Minhas Contas",
        description:
          "Use Minhas Contas para ver as contas atribuídas a você.",
        items: [
          "Revise nome da conta, endereço, agenda e detalhes importantes.",
          "Abra uma conta quando precisar de mais informações.",
          "Contate o escritório se alguma informação estiver incorreta.",
        ],
      },
      {
        title: "Reportar Problema",
        description:
          "Use Reportar Problema quando algo estiver errado em uma conta.",
        items: [
          "Escolha a conta.",
          "Descreva o problema claramente.",
          "Adicione fotos quando solicitado ou quando ajudar a explicar o problema.",
          "Envie o problema para o escritório revisar.",
        ],
      },
      {
        title: "Pedidos de Suprimentos",
        description:
          "Use Pedidos de Suprimentos para solicitar produtos de limpeza.",
        items: [
          "Escolha a conta que precisa de suprimentos.",
          "Selecione o item e a quantidade.",
          "Escolha retirada ou entrega.",
          "Use Outro / Não listado se o item não estiver na lista.",
        ],
      },
      {
        title: "Fotos",
        description:
          "Use fotos para documentar problemas, trabalho concluído ou condições da conta.",
        items: [
          "Tire fotos claras e com boa iluminação.",
          "Não envie fotos desnecessárias.",
          "Use fotos para reclamações, danos ou condições incomuns.",
          "As fotos devem abrir como pré-visualização ou imagem dentro do aplicativo da Cleaning World.",
          "As fotos não devem ser usadas para navegar nas pastas do Google Drive da Cleaning World.",
        ],
      },
    ],
  },
};

const languageButtons: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
];

export default function HelpPage() {
  const [language, setLanguage] = useState<Language>("en");
  const role = getStoredRole();

  const selectedContent = useMemo(() => content[language], [language]);

  const backHref = role === "subcontractor" ? "/subcontractor-portal" : "/";
  const backLabel =
    role === "subcontractor" ? "Back to Home" : "Back to Dashboard";

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700 sm:text-sm">
              {selectedContent.eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              {selectedContent.title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
              {selectedContent.subtitle}
            </p>
          </div>

          <Link
            href={backHref}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-center text-sm font-black text-white no-underline shadow-sm hover:bg-blue-950"
          >
            {backLabel}
          </Link>
        </div>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
            {selectedContent.aboutTitle}
          </p>

          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
            {selectedContent.aboutDescription}
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-blue-100 bg-white p-4">
              <h2 className="text-base font-black text-slate-950">
                {selectedContent.aboutAdminTitle}
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                {selectedContent.aboutAdminText}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-white p-4">
              <h2 className="text-base font-black text-slate-950">
                {selectedContent.aboutSubTitle}
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                {selectedContent.aboutSubText}
              </p>
            </div>

            <div className="rounded-2xl border border-amber-100 bg-white p-4">
              <h2 className="text-base font-black text-slate-950">
                {selectedContent.aboutImportantTitle}
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                {selectedContent.aboutImportantText}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {languageButtons.map((button) => (
            <button
              key={button.value}
              type="button"
              onClick={() => setLanguage(button.value)}
              className={`rounded-2xl px-4 py-2 text-sm font-black shadow-sm ${
                language === button.value
                  ? "bg-blue-700 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {button.label}
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-3xl border border-blue-100 bg-blue-50 p-5">
          <h2 className="text-xl font-black text-slate-950">
            {selectedContent.quickStartTitle}
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {selectedContent.quickStartItems.map((item, index) => (
              <div
                key={`${language}-quick-${index}`}
                className="rounded-2xl border border-blue-100 bg-white p-4 text-sm font-bold leading-6 text-slate-700"
              >
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-700 text-xs font-black text-white">
                  {index + 1}
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>

        <HelpGroup
          title={selectedContent.adminTitle}
          sections={selectedContent.adminSections}
        />

        <HelpGroup
          title={selectedContent.subTitle}
          sections={selectedContent.subSections}
        />

        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold leading-6 text-slate-600">
          {selectedContent.footerNote}
        </div>
      </section>
    </main>
  );
}

function HelpGroup({
  title,
  sections,
}: {
  title: string;
  sections: HelpSection[];
}) {
  return (
    <section className="mt-8">
      <h2 className="text-2xl font-black text-slate-950">{title}</h2>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {sections.map((section) => (
          <article
            key={section.title}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h3 className="text-lg font-black text-slate-950">
              {section.title}
            </h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              {section.description}
            </p>

            <ul className="mt-4 space-y-2">
              {section.items.map((item) => (
                <li
                  key={item}
                  className="flex gap-2 text-sm font-bold leading-6 text-slate-700"
                >
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-700" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}