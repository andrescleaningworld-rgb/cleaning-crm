"use client";

// Help for staff (office, managers, inside staff): the company rule, Quick
// start, a search box, the "I want to…" tasks grouped like the side menu, and
// "Who does what" for a new account. All the words are in lib/helpContent.ts.
// Subs and customers keep their own help in ./page.tsx.

import Link from "next/link";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { SearchBar } from "@/app/ui";
import { HELP_GROUP_ORDER, STAFF_HELP, type HelpLanguage, type HelpSection, type StaffHelpContent } from "@/lib/helpContent";

/** "Tap **Save**." → "Tap <strong>Save</strong>." */
function withBold(text: string): ReactNode {
  const parts = text.split("**");
  return parts.map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : <Fragment key={index}>{part}</Fragment>));
}

/** Lower case, no accents, no stars: "Añadir **Save**" → "anadir save". */
function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\*\*/g, "")
    .toLowerCase();
}

function sectionText(section: HelpSection): string {
  return plain([section.page, section.title, ...section.steps, section.tip].join(" "));
}

/** Every word typed must be somewhere in the section. */
function matches(haystack: string, query: string): boolean {
  const words = plain(query).split(/\s+/).filter(Boolean);
  return words.every((word) => haystack.includes(word));
}

function whoText(content: StaffHelpContent): string {
  const who = content.who;
  return plain([who.title, who.intro, who.checklistTitle, ...[...who.flow, ...who.checklist].flatMap((row) => [row.step, row.who, row.what])].join(" "));
}

function HelpCard({ section, tipWord }: { section: HelpSection; tipWord: string }) {
  return (
    <article className="ui-card ui-help-card" id={`help-${section.id}`}>
      <p className="ui-help-page">{section.page}</p>
      <h3 className="ui-card-title">{section.title}</h3>
      <ol className="ui-help-steps">
        {section.steps.map((step, index) => (
          <li key={index}>{withBold(step)}</li>
        ))}
      </ol>
      <p className="ui-help-tip">
        <span className="ui-strong">💡 {tipWord}:</span> {withBold(section.tip)}
      </p>
      {section.link ? (
        <Link href={section.link.href} className="ui-btn ui-btn-main ui-help-link">
          {section.link.label}
        </Link>
      ) : null}
    </article>
  );
}

function WhoDoesWhat({ content }: { content: StaffHelpContent }) {
  const who = content.who;
  const table = (rows: StaffHelpContent["who"]["flow"]) => (
    <div className="ui-help-table-wrap">
      <table className="ui-help-table">
        <thead>
          <tr>
            <th>{who.stepColumn}</th>
            <th>{who.whoColumn}</th>
            <th>{who.whatColumn}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.step}>
              <td className="ui-strong">{row.step}</td>
              <td>
                <span className="ui-help-who">{row.who}</span>
              </td>
              <td>{row.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <section className="ui-card ui-help-card" id="help-who-does-what">
      <h3 className="ui-card-title">{who.title}</h3>
      <p>{who.intro}</p>
      {table(who.flow)}
      <h4 className="ui-strong ui-help-subtitle">{who.checklistTitle}</h4>
      <p className="ui-muted">{who.checklistIntro}</p>
      {table(who.checklist)}
      <Link href={who.link.href} className="ui-btn ui-btn-main ui-help-link">
        {who.link.label}
      </Link>
    </section>
  );
}

export default function StaffHelp({ language }: { language: HelpLanguage }) {
  const content = STAFF_HELP[language];
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;

  const shown = useMemo(() => (searching ? content.sections.filter((section) => matches(sectionText(section), query)) : content.sections), [content, query, searching]);
  const showWho = !searching || matches(whoText(content), query);

  return (
    <div className="ui-stack ui-help">
      <p className="ui-help-rule" role="note">
        {content.rule}
      </p>

      <section className="ui-card">
        <h2 className="ui-card-title">{content.quickStartTitle}</h2>
        <ol className="ui-help-steps">
          {content.quickStart.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </section>

      <SearchBar value={query} onChange={setQuery} label={content.searchLabel} placeholder={content.searchPlaceholder} />

      {searching && shown.length === 0 && !showWho ? <p className="ui-card ui-muted">{content.noMatch}</p> : null}

      {HELP_GROUP_ORDER.map((group) => {
        const inGroup = shown.filter((section) => section.group === group);
        const withWho = group === "daily" && showWho;
        if (inGroup.length === 0 && !withWho) return null;
        return (
          <section key={group} className="ui-stack" aria-label={content.groups[group]}>
            <h2 className="ui-screen-title ui-help-group">{content.groups[group]}</h2>
            <div className="ui-help-grid">
              {inGroup.map((section) => (
                <Fragment key={section.id}>
                  <HelpCard section={section} tipWord={content.tipWord} />
                  {/* "Who does what" sits right after "Add a new account". */}
                  {section.id === "account-new" && withWho ? <WhoDoesWhat content={content} /> : null}
                </Fragment>
              ))}
              {withWho && !inGroup.some((section) => section.id === "account-new") ? <WhoDoesWhat content={content} /> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
