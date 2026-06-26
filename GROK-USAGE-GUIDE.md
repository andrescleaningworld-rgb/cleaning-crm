# How to Use Grok for More Improvements & Ideas

This guide explains the best ways to work with me (Grok) on an ongoing basis for the Cleaning World CRM project.

## 1. Just Talk to Me Naturally (Easiest Way)
You don’t need special commands to start. Just open the terminal and run `grok` (or continue in an existing session).

### Good prompting examples:
- “Pick up where we left off with the accounts page improvements.”
- “Brainstorm 5 ideas for making the subcontractor portal more useful.”
- “Review the latest commit and suggest the next quick safe improvements.”
- “What are the biggest UX or code quality problems in the current accounts list?”
- “Help me think through how to add X feature without breaking the Google Script backend.”

I remember the conversation context within a session and can look at the actual git state + files every time.

## 2. Be Specific: Ideas vs. Implementation
- **For ideas / exploration**: Say “give me ideas”, “brainstorm”, or “what would you improve next”. I’ll analyze the code and come back with options.
- **For implementation**: Be clear about scope and risk tolerance.

**Examples of good requests:**
- “Add a quick gross margin % display like we did before, but only in the summary tiles.”
- “Make a safe, incremental change to…”
- “I want low-risk changes only — no big refactors yet.”

This matches the successful style we used: quick, safe, verified with lint + build.

## 3. Useful Slash Commands
Type `/` in the prompt to open the command menu. The most helpful ones for this project:

- **/plan** — Best when you want me to explore first and propose a plan before writing any code (especially for medium or larger changes).
- **/implement "your task"** — Runs a more structured implement → review → fix loop. Good for higher-quality results on a specific feature.
- **/review** — Ask me to review recent changes, a specific file, or the whole codebase.
- **/check-work** — After I make changes, ask me to run full verification (lint, build, diff review, etc.).
- **/skills** — See available specialized skills.

You can also say:
- “Enter plan mode for improving the map page.”
- “Use the implement skill to add X.”

## 4. Recommended Workflow (What Worked Well)
1. Tell me the area + your constraints (“quick changes only”, “no breaking changes”, “focus on mobile”, etc.).
2. Let me explore or propose a small set of options.
3. You pick one (or ask me to implement a specific one).
4. I make the change + run lint/build verification.
5. You review (or ask me to commit/push).

I can maintain a running todo list so we don’t lose track across multiple improvements.

## 5. Project-Specific Tips
- Always remember the `AGENTS.md` warning about this being a special/patched version of Next.js. I will respect it, but you can remind me.
- We’ve been favoring **incremental, low-risk changes** that pass lint + build. Keep using that language if you want to stay in that style.
- Most of the app is client-side with heavy data normalization because of the Google Sheets backend. When asking for ideas, feel free to say “keep the Google Script dependency in mind.”
- Reference files with `@` (example: `@app/accounts/page.tsx`) so I pull the exact current version.

## 6. Tomorrow / Next Session Quick-Start Phrases
Copy and paste these:

- “Continue improving the accounts area. Show me the current state of the list page and suggest 3 more small useful additions.”
- “Brainstorm ideas for the reports and sales pages.”
- “What would you improve next in the subcontractor portal?”
- “Review everything we’ve done in the last two commits and give me a prioritized list of next safe improvements.”
- “I want ideas first — don’t write code yet.”

## 7. How to Resume Work
- Just say “continue from yesterday” or “pick up where we left off”.
- Reference specific commits: “Look at commit a74b9fe and the previous one…”
- I will always check the current git state when you start.

---

**Tip**: Keep this file in the project root so you (and future teammates) can easily reference it.

If you want a printable version in another format (.docx, .pdf, etc.), just ask.