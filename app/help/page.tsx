"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Language = "en" | "es" | "pt";
type UserRole = "admin" | "subcontractor" | "customer" | null;

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
  if (role === "customer") return "customer";

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
    aboutCustomerTitle: string;
    aboutCustomerText: string;
    aboutImportantTitle: string;
    aboutImportantText: string;
    quickStartTitle: string;
    quickStartItems: string[];
    adminTitle: string;
    subTitle: string;
    customerTitle: string;
    footerNote: string;
    adminSections: HelpSection[];
    subSections: HelpSection[];
    customerSections: HelpSection[];
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
    aboutCustomerTitle: "For Customers",
    aboutCustomerText:
      "The customer portal lets you view your account status, service details, schedule, and billing, and submit requests like reporting an issue, requesting extra service, changing a visit date, or asking about your bill.",
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
    customerTitle: "Customer Instructions",
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
        title: "Logging In",
        description:
          "Access the subcontractor portal using your registered email — no password required.",
        items: [
          "Go to the subcontractor portal link provided by Cleaning World.",
          "Enter the email address Cleaning World has on file for you.",
          "You're in — no password needed, just your registered email.",
        ],
      },
      {
        title: "Your Accounts",
        description: "See every account currently assigned to you.",
        items: [
          "The Accounts tab shows every account currently assigned to you.",
          "Each account shows the address, cleaning days, and scope of work.",
          "Tap an account to see full details.",
        ],
      },
      {
        title: "Reporting an Issue",
        description:
          "Let the office know right away when something is wrong at an account.",
        items: [
          "Go to the Report Issue tab.",
          "Select the account the issue relates to.",
          "Choose an issue type and urgency (Normal or Urgent).",
          "Describe the issue and attach photos if you have them.",
          "Submit — Cleaning World is notified immediately.",
        ],
      },
      {
        title: "Ordering Supplies",
        description: "Request cleaning supplies for pickup or delivery.",
        items: [
          "Go to the Order Supplies tab.",
          "Select the account, then the supply item you need.",
          "Enter the quantity and choose Pick Up or Delivery.",
          "Submit your order — you'll see the status update as Cleaning World processes it (New → Approved → Completed).",
        ],
      },
      {
        title: "Complaints",
        description: "Track customer complaints tied to your accounts.",
        items: [
          "If a customer complaint comes in for one of your accounts, you'll get an email with the details.",
          "The Complaints tab in the portal shows any open complaints tied to your accounts so you can follow up.",
        ],
      },
      {
        title: "Account Transfer Proposals",
        description:
          "Review and respond to accounts Cleaning World proposes transferring to you.",
        items: [
          "If Cleaning World proposes transferring an account to you, you'll receive an email with the account details and proposed monthly pay.",
          "Each account in the proposal has its own Accept and Decline button — review the details and respond to each one individually.",
          "Your response is recorded immediately; Cleaning World will follow up to finalize anything you accept.",
        ],
      },
      {
        title: "Need Help?",
        description: "Contact Cleaning World directly with any questions.",
        items: ["Phone: 201-487-1313", "Email: info@cleaningworldinc.com"],
      },
    ],
    customerSections: [
      {
        title: "Logging In",
        description: "Access the customer portal with your phone number and portal code.",
        items: [
          "Go to the customer portal login page.",
          "Enter the phone number Cleaning World has on file for your account.",
          "Enter your portal code (provided by Cleaning World).",
          "You're in — no separate password needed.",
        ],
      },
      {
        title: "Your Account",
        description: "See your account status and service details at a glance.",
        items: [
          "The dashboard shows your account status, service type, frequency, cleaning days, and start date.",
          "Your service address and full scope of work are listed for reference.",
        ],
      },
      {
        title: "Schedule & Visits",
        description: "Check upcoming and past service visits.",
        items: [
          "See your next scheduled service and last visit date at a glance.",
          "The visit calendar shows upcoming and completed visits.",
        ],
      },
      {
        title: "Billing",
        description: "View your estimated monthly total.",
        items: [
          "View your estimated monthly total, including NJ sales tax.",
          "The amount assumes no service changes or missed cleanings.",
        ],
      },
      {
        title: "Submitting Portal Requests",
        description: "Send a request directly to Cleaning World from your dashboard.",
        items: [
          "Report an Issue — let Cleaning World know about a problem with your service.",
          "Request Service — ask for an additional or one-time cleaning.",
          "Change Date — request a change to an upcoming scheduled visit.",
          "Billing Request — ask a question or raise an issue about your bill.",
        ],
      },
      {
        title: "Need Help?",
        description: "Contact Cleaning World directly with any questions.",
        items: ["Phone: 201-487-1313", "Email: info@cleaningworldinc.com"],
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
    aboutCustomerTitle: "Para Clientes",
    aboutCustomerText:
      "El portal de clientes te permite ver el estado de tu cuenta, detalles del servicio, horario y facturación, además de enviar solicitudes como reportar un problema, pedir servicio adicional, cambiar la fecha de una visita, o preguntar sobre tu factura.",
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
    customerTitle: "Instrucciones para Clientes",
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
        title: "Iniciar Sesión",
        description:
          "Accede al portal de subcontratistas usando tu correo registrado — no se necesita contraseña.",
        items: [
          "Ve al enlace del portal de subcontratistas proporcionado por Cleaning World.",
          "Ingresa el correo electrónico que Cleaning World tiene registrado para ti.",
          "Listo — no necesitas contraseña, solo tu correo registrado.",
        ],
      },
      {
        title: "Tus Cuentas",
        description: "Consulta todas las cuentas asignadas a ti actualmente.",
        items: [
          "La pestaña Cuentas muestra todas las cuentas asignadas a ti actualmente.",
          "Cada cuenta muestra la dirección, los días de limpieza y el alcance del trabajo.",
          "Toca una cuenta para ver todos los detalles.",
        ],
      },
      {
        title: "Reportar un Problema",
        description:
          "Avisa a la oficina de inmediato cuando algo esté mal en una cuenta.",
        items: [
          "Ve a la pestaña Reportar Problema.",
          "Selecciona la cuenta relacionada con el problema.",
          "Elige el tipo de problema y la urgencia (Normal o Urgente).",
          "Describe el problema y adjunta fotos si las tienes.",
          "Envía — Cleaning World recibe la notificación de inmediato.",
        ],
      },
      {
        title: "Ordenar Suministros",
        description: "Solicita productos de limpieza para recoger o entrega.",
        items: [
          "Ve a la pestaña Ordenar Suministros.",
          "Selecciona la cuenta y luego el artículo que necesitas.",
          "Ingresa la cantidad y elige Recoger o Entrega.",
          "Envía tu pedido — verás el estado actualizarse a medida que Cleaning World lo procesa (Nuevo → Aprobado → Completado).",
        ],
      },
      {
        title: "Quejas",
        description:
          "Da seguimiento a las quejas de clientes relacionadas con tus cuentas.",
        items: [
          "Si llega una queja de un cliente sobre una de tus cuentas, recibirás un correo con los detalles.",
          "La pestaña Quejas en el portal muestra las quejas abiertas relacionadas con tus cuentas para que puedas darles seguimiento.",
        ],
      },
      {
        title: "Propuestas de Transferencia de Cuentas",
        description:
          "Revisa y responde a las cuentas que Cleaning World te proponga transferir.",
        items: [
          "Si Cleaning World te propone transferirte una cuenta, recibirás un correo con los detalles de la cuenta y el pago mensual propuesto.",
          "Cada cuenta en la propuesta tiene sus propios botones de Aceptar y Rechazar — revisa los detalles y responde a cada una individualmente.",
          "Tu respuesta se registra de inmediato; Cleaning World se pondrá en contacto para finalizar lo que aceptes.",
        ],
      },
      {
        title: "¿Necesitas Ayuda?",
        description: "Comunícate directamente con Cleaning World con cualquier pregunta.",
        items: ["Teléfono: 201-487-1313", "Correo: info@cleaningworldinc.com"],
      },
    ],
    customerSections: [
      {
        title: "Iniciar Sesión",
        description: "Accede al portal de clientes con tu número de teléfono y código de portal.",
        items: [
          "Ve a la página de inicio de sesión del portal de clientes.",
          "Ingresa el número de teléfono que Cleaning World tiene registrado para tu cuenta.",
          "Ingresa tu código de portal (proporcionado por Cleaning World).",
          "Listo — no necesitas una contraseña separada.",
        ],
      },
      {
        title: "Tu Cuenta",
        description: "Consulta el estado y los detalles de tu cuenta de un vistazo.",
        items: [
          "El panel muestra el estado de tu cuenta, tipo de servicio, frecuencia, días de limpieza y fecha de inicio.",
          "Tu dirección de servicio y el alcance completo del trabajo están disponibles para consulta.",
        ],
      },
      {
        title: "Horario y Visitas",
        description: "Consulta tus visitas próximas y pasadas.",
        items: [
          "Consulta tu próximo servicio programado y la fecha de tu última visita de un vistazo.",
          "El calendario de visitas muestra las visitas próximas y completadas.",
        ],
      },
      {
        title: "Facturación",
        description: "Consulta tu total mensual estimado.",
        items: [
          "Consulta tu total mensual estimado, incluyendo el impuesto de ventas de NJ.",
          "El monto asume que no hay cambios de servicio ni limpiezas perdidas.",
        ],
      },
      {
        title: "Enviar Solicitudes al Portal",
        description: "Envía una solicitud directamente a Cleaning World desde tu panel.",
        items: [
          "Reportar un Problema — avisa a Cleaning World sobre un problema con tu servicio.",
          "Solicitar Servicio — pide una limpieza adicional o única.",
          "Cambiar Fecha — solicita un cambio en una visita programada próxima.",
          "Solicitud de Facturación — haz una pregunta o reporta un problema sobre tu factura.",
        ],
      },
      {
        title: "¿Necesitas Ayuda?",
        description: "Comunícate directamente con Cleaning World con cualquier pregunta.",
        items: ["Teléfono: 201-487-1313", "Correo: info@cleaningworldinc.com"],
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
    aboutCustomerTitle: "Para Clientes",
    aboutCustomerText:
      "O portal do cliente permite que você veja o status da sua conta, detalhes do serviço, agenda e faturamento, além de enviar solicitações como relatar um problema, pedir um serviço extra, mudar a data de uma visita, ou perguntar sobre sua fatura.",
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
    customerTitle: "Instruções para Clientes",
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
        title: "Fazer Login",
        description:
          "Acesse o portal de subcontratados usando seu e-mail registrado — sem necessidade de senha.",
        items: [
          "Acesse o link do portal de subcontratados fornecido pela Cleaning World.",
          "Digite o e-mail que a Cleaning World tem registrado para você.",
          "Pronto — não é necessária senha, apenas o seu e-mail registrado.",
        ],
      },
      {
        title: "Suas Contas",
        description: "Veja todas as contas atualmente atribuídas a você.",
        items: [
          "A aba Contas mostra todas as contas atualmente atribuídas a você.",
          "Cada conta mostra o endereço, os dias de limpeza e o escopo do trabalho.",
          "Toque em uma conta para ver todos os detalhes.",
        ],
      },
      {
        title: "Relatar um Problema",
        description:
          "Avise o escritório imediatamente quando algo estiver errado em uma conta.",
        items: [
          "Vá até a aba Relatar Problema.",
          "Selecione a conta relacionada ao problema.",
          "Escolha o tipo de problema e a urgência (Normal ou Urgente).",
          "Descreva o problema e anexe fotos, se tiver.",
          "Envie — a Cleaning World é notificada imediatamente.",
        ],
      },
      {
        title: "Pedir Suprimentos",
        description: "Solicite produtos de limpeza para retirada ou entrega.",
        items: [
          "Vá até a aba Pedir Suprimentos.",
          "Selecione a conta e depois o item que você precisa.",
          "Digite a quantidade e escolha Retirada ou Entrega.",
          "Envie seu pedido — você verá o status atualizar conforme a Cleaning World processa (Novo → Aprovado → Concluído).",
        ],
      },
      {
        title: "Reclamações",
        description: "Acompanhe reclamações de clientes ligadas às suas contas.",
        items: [
          "Se uma reclamação de cliente chegar sobre uma de suas contas, você receberá um e-mail com os detalhes.",
          "A aba Reclamações no portal mostra as reclamações em aberto relacionadas às suas contas para que você possa acompanhar.",
        ],
      },
      {
        title: "Propostas de Transferência de Conta",
        description:
          "Revise e responda às contas que a Cleaning World propuser transferir para você.",
        items: [
          "Se a Cleaning World propuser transferir uma conta para você, você receberá um e-mail com os detalhes da conta e o pagamento mensal proposto.",
          "Cada conta na proposta tem seus próprios botões de Aceitar e Recusar — revise os detalhes e responda a cada uma individualmente.",
          "Sua resposta é registrada imediatamente; a Cleaning World entrará em contato para finalizar o que você aceitar.",
        ],
      },
      {
        title: "Precisa de Ajuda?",
        description: "Entre em contato diretamente com a Cleaning World com qualquer dúvida.",
        items: ["Telefone: 201-487-1313", "E-mail: info@cleaningworldinc.com"],
      },
    ],
    customerSections: [
      {
        title: "Fazer Login",
        description: "Acesse o portal do cliente com seu número de telefone e código de portal.",
        items: [
          "Acesse a página de login do portal de clientes.",
          "Digite o número de telefone que a Cleaning World tem registrado para sua conta.",
          "Digite seu código de portal (fornecido pela Cleaning World).",
          "Pronto — não é necessária uma senha separada.",
        ],
      },
      {
        title: "Sua Conta",
        description: "Veja o status e os detalhes da sua conta rapidamente.",
        items: [
          "O painel mostra o status da sua conta, tipo de serviço, frequência, dias de limpeza e data de início.",
          "Seu endereço de serviço e o escopo completo do trabalho estão disponíveis para consulta.",
        ],
      },
      {
        title: "Agenda e Visitas",
        description: "Veja suas visitas futuras e concluídas.",
        items: [
          "Veja seu próximo serviço agendado e a data da última visita rapidamente.",
          "O calendário de visitas mostra as visitas futuras e concluídas.",
        ],
      },
      {
        title: "Faturamento",
        description: "Veja seu total mensal estimado.",
        items: [
          "Veja seu total mensal estimado, incluindo o imposto sobre vendas de NJ.",
          "O valor assume que não há mudanças de serviço nem limpezas perdidas.",
        ],
      },
      {
        title: "Enviar Solicitações pelo Portal",
        description: "Envie uma solicitação diretamente à Cleaning World pelo seu painel.",
        items: [
          "Relatar um Problema — avise a Cleaning World sobre um problema com seu serviço.",
          "Solicitar Serviço — peça uma limpeza extra ou avulsa.",
          "Mudar Data — solicite uma mudança em uma visita agendada futura.",
          "Solicitação de Faturamento — faça uma pergunta ou relate um problema sobre sua fatura.",
        ],
      },
      {
        title: "Precisa de Ajuda?",
        description: "Entre em contato diretamente com a Cleaning World com qualquer dúvida.",
        items: ["Telefone: 201-487-1313", "E-mail: info@cleaningworldinc.com"],
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
  const [role, setRole] = useState<UserRole>(null);
  const [roleChecked, setRoleChecked] = useState(false);

  // Instant client-side guess (covers subcontractor, which has no server
  // session), then reconcile with the authoritative server-side check below.
  useEffect(() => {
    setRole(getStoredRole());

    let cancelled = false;

    async function resolveRole() {
      try {
        const response = await fetch("/api/session-role", { cache: "no-store" });
        const data = (await response.json()) as { isAdmin?: boolean; isCustomer?: boolean };

        if (cancelled) return;

        if (data.isAdmin) {
          setRole("admin");
        } else if (data.isCustomer) {
          setRole("customer");
        } else {
          setRole(getStoredRole());
        }
      } catch {
        if (!cancelled) setRole(getStoredRole());
      } finally {
        if (!cancelled) setRoleChecked(true);
      }
    }

    resolveRole();

    return () => {
      cancelled = true;
    };
  }, []);

  // Admin content isn't translated for a PT toggle per the current spec —
  // reset off it if role resolves to admin after PT was already selected.
  useEffect(() => {
    if (role === "admin" && language === "pt") {
      setLanguage("en");
    }
  }, [role, language]);

  const availableLanguageButtons =
    role === "admin"
      ? languageButtons.filter((button) => button.value !== "pt")
      : languageButtons;

  const selectedContent = useMemo(() => content[language], [language]);

  const backHref =
    role === "subcontractor"
      ? "/subcontractor-portal"
      : role === "customer"
        ? "/portal/dashboard"
        : "/";
  const backLabel =
    role === "subcontractor"
      ? "Back to Home"
      : role === "customer"
        ? "Back to My Account"
        : "Back to Dashboard";

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

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {role ? (
              <div className="rounded-2xl border border-blue-100 bg-white p-4">
                <h2 className="text-base font-black text-slate-950">
                  {role === "admin"
                    ? selectedContent.aboutAdminTitle
                    : role === "customer"
                      ? selectedContent.aboutCustomerTitle
                      : selectedContent.aboutSubTitle}
                </h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  {role === "admin"
                    ? selectedContent.aboutAdminText
                    : role === "customer"
                      ? selectedContent.aboutCustomerText
                      : selectedContent.aboutSubText}
                </p>
              </div>
            ) : null}

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
          {availableLanguageButtons.map((button) => (
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

        {role === "admin" ? (
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
        ) : null}

        {role === "admin" ? (
          <HelpGroup
            title={selectedContent.adminTitle}
            sections={selectedContent.adminSections}
          />
        ) : null}

        {role === "subcontractor" ? (
          <HelpGroup
            title={selectedContent.subTitle}
            sections={selectedContent.subSections}
          />
        ) : null}

        {role === "customer" ? (
          <HelpGroup
            title={selectedContent.customerTitle}
            sections={selectedContent.customerSections}
          />
        ) : null}

        {!role && roleChecked ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-600">
            We couldn&apos;t detect an active session for your account type. Please log in
            through the correct portal — Admin, Subcontractor, or Customer — to see
            instructions for your account.
          </div>
        ) : null}

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