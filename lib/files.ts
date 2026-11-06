// Uploaded files (photos, estimates, documents, COIs...), private.
//
// Storage. With BLOB_PRIVATE_READ_WRITE_TOKEN set (a private Vercel Blob
// store connected to the project), every new upload goes there and is saved
// in the database as the app's own address, "/api/files/<pathname>". Nobody
// can open the file from storage directly. Without it, uploads go to the
// public store as before (BLOB_READ_WRITE_TOKEN) and keep their public URL,
// so nothing changes until the private store is connected.
//
// Opening a file: GET /api/files/<pathname> (app/api/files/[...path]/route.ts)
// lets in logged-in staff, or anyone holding a short-lived signed link
// (?e=<expiry>&s=<signature>) that a screen for a sub, a customer, the TV or a
// crew handed out for a file that screen is allowed to show. Then it sends the
// browser on to a storage link that works for a few minutes only.
//
//   put / del           drop-in for @vercel/blob's put / del (same options)
//   signFileLink(url)   the short-lived link for one file ("" stays "")
//   signFileLinks(data) every "/api/files/..." string inside a JSON answer
//   absoluteFileLink    a file link for an email (staff log in to open it)
//   openStoredFile      the file's bytes, for server code (email attachments)

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { put as blobPut, del as blobDel, get as blobGet, issueSignedToken, presignUrl, type PutBlobResult, type PutCommandOptions } from "@vercel/blob";

export const FILES_ROUTE = "/api/files/";
/** How long a signed link from a screen keeps working. */
export const LINK_MINUTES = 60;
/** How long the storage link the route sends the browser to keeps working. */
const STORAGE_LINK_SECONDS = 5 * 60;

const privateToken = () => (process.env.BLOB_PRIVATE_READ_WRITE_TOKEN ?? "").trim();
/** True once the private store is connected: new uploads are private. */
export const privateFilesOn = () => privateToken() !== "";
/** Some file storage is set up here (private or public). */
export const fileStorageOn = () => privateFilesOn() || Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const encodePath = (pathname: string) => pathname.split("/").map(encodeURIComponent).join("/");

/** "/api/files/photos/a.jpg?e=..." -> "photos/a.jpg"; null when it is not one of ours. */
export function storedPathname(url: string): string | null {
  const text = String(url ?? "").trim();
  if (!text) return null;
  let path = text;
  try {
    if (/^https?:\/\//i.test(text)) {
      const parsed = new URL(text);
      // A private store's own URL (a client upload's answer): its pathname.
      if (parsed.hostname.endsWith(".private.blob.vercel-storage.com")) return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
      path = parsed.pathname;
    }
  } catch {
    return null;
  }
  if (!path.startsWith(FILES_ROUTE)) return null;
  return decodeURIComponent(path.slice(FILES_ROUTE.length).split("?")[0]);
}

/** The address saved in the database for a private file. */
export const storedFileUrl = (pathname: string) => FILES_ROUTE + encodePath(pathname);

/**
 * A client upload's answer (a private store URL) as the address to save.
 * Anything else (a public URL) is returned unchanged.
 */
export function toStoredUrl(url: string): string {
  const text = String(url ?? "").trim();
  // A signed link a screen sent back (an upload's answer): saved without its signature.
  if (text.startsWith(FILES_ROUTE)) return storedFileUrl(storedPathname(text) ?? "");
  try {
    if (/^https?:\/\//i.test(text) && new URL(text).hostname.endsWith(".private.blob.vercel-storage.com")) return storedFileUrl(storedPathname(text) ?? "");
  } catch {
    // not a URL: unchanged
  }
  return text;
}

/** Drop-in for @vercel/blob put: private when the private store is connected. `url` is then the app's address. */
export async function put(pathname: string, body: Parameters<typeof blobPut>[1], options: PutCommandOptions): Promise<PutBlobResult> {
  if (privateFilesOn()) {
    const blob = await blobPut(pathname, body, { ...options, access: "private", token: privateToken() } as PutCommandOptions);
    const url = storedFileUrl(blob.pathname);
    return { ...blob, url, downloadUrl: url };
  }
  return blobPut(pathname, body, { ...options, access: "public" } as PutCommandOptions);
}

/** Drop-in for @vercel/blob del: the app's addresses go to the private store, the rest as before. */
export async function del(urlOrUrls: string | string[]): Promise<void> {
  const list = Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls];
  const privatePaths = list.map(storedPathname).filter((path): path is string => Boolean(path));
  const others = list.filter((url) => !storedPathname(url));
  if (privatePaths.length > 0 && privateFilesOn()) await blobDel(privatePaths, { token: privateToken() });
  if (others.length > 0) await blobDel(others);
}

/* ---------- signed links ---------- */

function secret(): string {
  const value = (process.env.FILE_LINK_SECRET ?? process.env.SUB_SESSION_PASSWORD ?? "").trim();
  if (value.length < 16) throw new Error("FILE_LINK_SECRET (or SUB_SESSION_PASSWORD) must be set to sign file links.");
  return value;
}

const signature = (pathname: string, expires: number) => crypto.createHmac("sha256", secret()).update(`${pathname}\n${expires}`).digest("base64url").slice(0, 32);

/** The short-lived link to one stored file. Public URLs and "" are returned unchanged. */
export function signFileLink(url: string, minutes = LINK_MINUTES): string {
  const pathname = storedPathname(url);
  if (!pathname) return url;
  // The expiry steps in 30-minute blocks, so a screen that reloads every
  // minute (the TV) gets the same link for a while and the browser can reuse
  // the picture. It works for `minutes` at least, at most 30 minutes more.
  const block = 30 * 60_000;
  const expires = (Math.floor(Date.now() / block) + 1) * block + minutes * 60_000;
  return `${storedFileUrl(pathname)}?e=${expires}&s=${signature(pathname, expires)}`;
}

/** True when the link's signature is right and it has not expired. */
export function signatureOk(pathname: string, expires: string | null, sig: string | null): boolean {
  const when = Number(expires);
  if (!sig || !Number.isFinite(when) || when < Date.now()) return false;
  const expected = signature(pathname, when);
  return expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

/** Every stored-file address inside a JSON answer, signed (for screens without a staff login). */
export function signFileLinks<T>(data: T, minutes = LINK_MINUTES): T {
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return value.startsWith(FILES_ROUTE) ? signFileLink(value, minutes) : value;
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, walk(item)]));
    }
    return value;
  };
  return walk(data) as T;
}

/** A file link inside an email to the office: the full address (staff log in to open it). */
export function absoluteFileLink(origin: string, url: string): string {
  return url.startsWith(FILES_ROUTE) ? `${origin.replace(/\/$/, "")}${url}` : url;
}

/* ---------- reading ---------- */

/** The storage link for one private file, good for a few minutes. */
export async function storageLink(pathname: string): Promise<string> {
  const validUntil = Date.now() + STORAGE_LINK_SECONDS * 1000;
  const issued = await issueSignedToken({ token: privateToken(), pathname, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(issued, { operation: "get", pathname, access: "private", validUntil });
  return presignedUrl;
}

/** The file's bytes for server code (an email attachment), whatever kind of address it has. Null when it cannot be read. */
export async function openStoredFile(url: string): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  const pathname = storedPathname(url);
  if (pathname) {
    if (!privateFilesOn()) return null;
    const result = await blobGet(pathname, { access: "private", token: privateToken() });
    if (!result || !result.stream) return null;
    const data = await new Response(result.stream).arrayBuffer();
    return { data, contentType: result.blob?.contentType ?? "application/octet-stream" };
  }
  const response = await fetch(url);
  if (!response.ok) return null;
  return { data: await response.arrayBuffer(), contentType: response.headers.get("content-type") ?? "application/octet-stream" };
}

/** NextResponse.json with every stored-file address signed: for answers to screens without a staff login (sub, customer, TV, crew, tablet). */
export function filesJson(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(signFileLinks(data), init);
}

/** The token a browser upload (handleUpload) is given: the private store's when connected, else the default (public). */
export function uploadToken(): string | undefined {
  return privateFilesOn() ? privateToken() : undefined;
}
