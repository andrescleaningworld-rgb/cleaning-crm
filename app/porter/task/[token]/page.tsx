"use client";

// A CW Now to-do on the sub's phone: open, see, Done. No login. One task,
// giant buttons, very few words, English / Español / Português. It uses the
// CW Now header, language switch and green "Sent" screen (../../[code]/ui).

import { upload } from "@vercel/blob/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTeamHubLang } from "@/app/team-hub/teamHubStrings";
import { NEEDS_PHOTO_ERROR, NEEDS_PHOTO_WORDS, TASK_WORDS, type PublicTask } from "@/lib/cwNowTasks";
import { shrinkImage } from "@/lib/imageResize";
import { sizeText } from "@/lib/accountDocuments";
import { pageFor } from "@/lib/taskPage";
import TaskPageView, { PlainTask, TaskSheet } from "@/app/components/TaskPageView";
import { crewLinkStrings } from "../../[code]/strings";
import { CenteredMessage, ErrorBox, LangSwitch, SentScreen } from "../../[code]/ui";

// The same name the rest of CW Now remembers on this phone.
const NAME_KEY = "crew-link-name";
const readName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};
const keepName = (name: string) => {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
  } catch {
    // this visit still has it
  }
};

const BIG = "min-h-[64px] w-full rounded-2xl border-2 border-blue-100 bg-white px-4 text-xl font-bold text-blue-800 shadow-sm active:bg-slate-100 disabled:text-slate-400";

export default function CwNowTaskPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";
  const api = `/api/porter-checklist/task/${encodeURIComponent(token)}`;
  const [lang, setLang] = useTeamHubLang();
  const words = TASK_WORDS[lang];
  const crew = crewLinkStrings(lang);

  const [task, setTask] = useState<PublicTask | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "gone" | "failed">("loading");
  const [name, setName] = useState("");
  const [panel, setPanel] = useState<"" | "note" | "name">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [doneScreen, setDoneScreen] = useState(false);
  const seenSent = useRef(false);
  const langPicked = useRef(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(api, { cache: "no-store" });
      if (response.status === 404) return setState("gone");
      const data = (await response.json()) as { success?: boolean; task?: PublicTask };
      if (!response.ok || !data.task) return setState((now) => (now === "ready" ? now : "failed"));
      setTask(data.task);
      setState("ready");
    } catch {
      setState((now) => (now === "ready" ? now : "failed"));
    }
  }, [api]);

  useEffect(() => {
    setName(readName());
    void load();
  }, [load]);

  // The link's language is only where the page starts: the sub can still switch.
  useEffect(() => {
    if (langPicked.current) return;
    const linkLang = new URLSearchParams(window.location.search).get("lang");
    if (linkLang === "es" || linkLang === "pt" || linkLang === "en") {
      langPicked.current = true;
      setLang(linkLang);
    }
  }, [setLang]);

  // Seen: only once this page has really opened, so a WhatsApp or text link preview never counts.
  useEffect(() => {
    if (state !== "ready" || seenSent.current) return;
    seenSent.current = true;
    void fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "seen" }) }).catch(() => undefined);
  }, [state, api]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!response.ok || data.success !== true) throw new Error(data.error === NEEDS_PHOTO_ERROR ? NEEDS_PHOTO_ERROR : "failed");
  }

  async function finish(who: string) {
    // A complaint needs a photo of the fix before it can go to the office for review.
    if (task?.needsPhoto) {
      setPanel("");
      return setError(NEEDS_PHOTO_WORDS[lang]);
    }
    setBusy("done");
    setError("");
    try {
      await post({ action: "done", name: who });
      keepName(who);
      setPanel("");
      setDoneScreen(true);
    } catch (failure) {
      setError(failure instanceof Error && failure.message === NEEDS_PHOTO_ERROR ? NEEDS_PHOTO_WORDS[lang] : words.failed);
    } finally {
      setBusy("");
    }
  }

  async function sendNote() {
    if (!note.trim()) return;
    setBusy("note");
    setError("");
    try {
      await post({ action: "note", name, note: note.trim() });
      setNote("");
      setPanel("");
      setFlash(words.saved);
      await load();
    } catch {
      setError(words.failed);
    } finally {
      setBusy("");
    }
  }

  async function sendPhotos(files: FileList | null) {
    if (!files || files.length === 0 || !task) return;
    setBusy("photo");
    setError("");
    try {
      for (const file of Array.from(files).slice(0, 5)) {
        // A big phone photo goes small first. One this phone cannot read (HEIC) goes as it is.
        const small = await shrinkImage(file, 1600, 0.82);
        const body = small ?? file;
        const ending = small ? "jpg" : (file.name.split(".").pop() ?? "jpg").toLowerCase();
        const blob = await upload(`${task.uploadFolder}/${crypto.randomUUID()}.${ending}`, body, { access: "private", handleUploadUrl: `${api}/upload`, contentType: small ? "image/jpeg" : file.type || undefined });
        await post({ action: "photo", name, url: blob.url, fileName: file.name, size: body.size, contentType: small ? "image/jpeg" : file.type });
      }
      setFlash(words.saved);
      await load();
    } catch {
      setError(words.photoFailed);
    } finally {
      setBusy("");
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  if (state === "loading") return <CenteredMessage title={words.loading} />;
  if (state === "gone") return <CenteredMessage title={words.goneTitle} body={words.goneBody} />;
  if (state === "failed" || !task) return <CenteredMessage title={words.failed} />;

  if (doneScreen) {
    return (
      <SentScreen
        s={crew}
        title={words.doneTitle}
        button={words.ok}
        onDone={() => {
          setDoneScreen(false);
          void load();
        }}
      />
    );
  }

  const translated = lang === "en" ? "" : task.translations[lang] ?? "";
  const isDone = task.status === "done";

  return (
    <main className="min-h-screen bg-white px-3 py-3">
      <div className="mx-auto max-w-xl space-y-4">
        <TaskSheet
          accountName={task.accountName}
          location={task.location}
          dueDate={task.dueDate}
          dueTime={task.dueTime}
          status={task.status}
          urgent={task.urgent}
          lang={lang}
          kind={task.linkKind}
          contact={task.contact}
          youGetPaid={task.youGetPaid}
          photosRequired={task.photosRequired}
          top={<div className="mb-3 rounded-2xl bg-blue-800 p-1"><LangSwitch lang={lang} onChange={setLang} /></div>}
        >
          {task.pages ? (
            <TaskPageView page={pageFor(task.pages, lang)} lang={lang} />
          ) : (
            <>
              <PlainTask text={translated || task.task} lang={lang} />
              {translated && translated !== task.task ? (
                <p className="mt-3 whitespace-pre-wrap border-t border-slate-200 pt-3 text-base text-slate-600">
                  <span className="font-bold">{words.original}: </span>
                  {task.task}
                </p>
              ) : null}
            </>
          )}
        </TaskSheet>

        {task.files.length > 0 ? (
          <section className="space-y-2">
            <p className="text-lg font-bold text-slate-700">📎 {words.files}</p>
            {task.files.map((file) => (
              <a key={file.id} href={file.url} target="_blank" rel="noopener" className={`${BIG} flex items-center justify-between gap-3 py-3`}>
                <span className="min-w-0 break-words">{file.name}</span>
                <span className="shrink-0 text-base font-semibold text-slate-500">{sizeText(file.size)}</span>
              </a>
            ))}
          </section>
        ) : null}

        <ErrorBox message={error} />
        {flash ? <p role="status" className="rounded-2xl bg-green-100 px-4 py-3 text-center text-xl font-bold text-green-800">{flash}</p> : null}

        {isDone ? (
          <p className="rounded-3xl bg-green-600 px-4 py-6 text-center text-3xl font-black text-white">{words.doneAlready}</p>
        ) : panel === "name" ? (
          <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
            <label className="block">
              <span className="text-xl font-bold text-slate-700">{words.yourName}</span>
              <input autoFocus autoComplete="name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 min-h-[64px] w-full rounded-xl border-2 border-slate-300 px-3 text-2xl font-semibold outline-none focus:border-blue-600" />
            </label>
            <button type="button" disabled={!name.trim() || busy !== ""} onClick={() => void finish(name.trim())} className="min-h-[88px] w-full rounded-3xl bg-green-600 text-4xl font-black text-white shadow-lg active:bg-green-700 disabled:bg-slate-300">
              {busy === "done" ? words.sending : `✓ ${words.done}`}
            </button>
            <button type="button" onClick={() => setPanel("")} className={BIG}>{words.cancel}</button>
          </section>
        ) : (
          <button type="button" disabled={busy !== ""} onClick={() => (name.trim() ? void finish(name.trim()) : setPanel("name"))} className="min-h-[104px] w-full rounded-3xl bg-green-600 text-5xl font-black text-white shadow-lg active:bg-green-700 disabled:bg-slate-300">
            {busy === "done" ? words.sending : `✓ ${words.done}`}
          </button>
        )}

        {!isDone && panel === "note" ? (
          <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
            <textarea autoFocus rows={4} maxLength={1000} value={note} placeholder={words.notePlaceholder} aria-label={words.addNote} onChange={(event) => setNote(event.target.value)} className="w-full rounded-xl border-2 border-slate-300 p-3 text-xl outline-none focus:border-blue-600" />
            <button type="button" disabled={!note.trim() || busy !== ""} onClick={() => void sendNote()} className="min-h-[64px] w-full rounded-2xl bg-blue-700 text-xl font-black text-white disabled:bg-slate-300">
              {busy === "note" ? words.sending : words.send}
            </button>
            <button type="button" onClick={() => setPanel("")} className={BIG}>{words.cancel}</button>
          </section>
        ) : null}

        {!isDone && panel === "" ? (
          <div className="grid gap-3">
            <button type="button" className={BIG} disabled={busy !== ""} onClick={() => { setFlash(""); setPanel("note"); }}>📝 {words.addNote}</button>
            {task.canAddPhoto ? (
              <>
                <input ref={photoInput} type="file" accept="image/*" multiple className="sr-only" aria-label={words.addPhoto} onChange={(event) => void sendPhotos(event.target.files)} />
                <button type="button" className={BIG} disabled={busy !== ""} onClick={() => { setFlash(""); photoInput.current?.click(); }}>
                  {busy === "photo" ? words.sending : `📷 ${words.addPhoto}`}
                </button>
              </>
            ) : null}
            <a className={`${BIG} flex items-center justify-center`} href={`${api}/calendar`}>📅 {words.calendar}</a>
          </div>
        ) : null}

        {task.notes.length > 0 || task.photos.length > 0 ? (
          <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-lg font-bold text-slate-500">{words.yourNotes}</p>
            {task.notes.map((entry) => <p key={entry.at} className="whitespace-pre-wrap text-lg text-slate-900">{entry.text}</p>)}
            {task.photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {task.photos.map((photo) => <img key={photo.id} src={photo.url} alt="" className="aspect-square w-full rounded-lg object-cover" />)}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
