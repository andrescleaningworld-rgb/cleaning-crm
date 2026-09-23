// Crew Link (docs/crew-link-spec.md): the Porter Checklist link plus "Order
// supplies" and "Report a problem". One resolver for every public Crew Link
// route, so they all agree on which modules a link has:
// - checklist: the Accounts sheet "Checklist Needed" flag (unchanged —
//   same check app/api/porter-checklist has always made);
// - supplyOrders / problemReports: checklist_templates columns (Postgres).
// The link is live when any module is on. Account data is read only.
import { getMainAccountById } from "@/lib/googleSheets";
import { getTemplateByPorterCode, type ChecklistTemplateRow } from "@/lib/checklistDb";

export type CrewLinkModules = { checklist: boolean; supplyOrders: boolean; problemReports: boolean };

export async function resolveCrewLink(code: string): Promise<{ template: ChecklistTemplateRow; modules: CrewLinkModules } | null> {
  if (!code) return null;
  const template = await getTemplateByPorterCode(code);
  if (!template) return null;
  const account = await getMainAccountById(template.accountId);
  const modules: CrewLinkModules = {
    checklist: Boolean(account?.checklistNeeded),
    supplyOrders: template.supplyOrdersEnabled,
    problemReports: template.problemReportsEnabled,
  };
  return { template, modules };
}

export function crewLinkIsLive(modules: CrewLinkModules): boolean {
  return modules.checklist || modules.supplyOrders || modules.problemReports;
}

export const CREW_LINK_MAX_NAME_LENGTH = 80;

export function cleanReporterName(value: unknown): string {
  return String(value ?? "").trim().slice(0, CREW_LINK_MAX_NAME_LENGTH);
}
