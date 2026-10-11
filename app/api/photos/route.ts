import { after, NextRequest, NextResponse } from "next/server";
import { isPostgres } from "@/lib/dataSource";
import { addPhoto, copyDrivePhotos, listPhotosShape } from "@/lib/pg/photos";
import { fetchAppsScript, AppsScriptFetchError } from "@/lib/appsScriptFetch";

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

// Apps Script latency has been measured spiking to ~14s on a single call;
// this must comfortably exceed the per-attempt timeout in fetchAppsScript
// (18s) plus its one retry plus backoff, or Vercel would kill the function
// before our own retry/error-handling logic gets a chance to run. Matches
// the budget used by /api/accounts and /api/subcontractor-portal for the
// same upstream.
export const maxDuration = 45;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}

export async function GET() {
  // DATA_SOURCE_PHOTOS=postgres: the same list, in the same shape, without
  // Apps Script. Old Drive photos are copied into Blob storage a few at a
  // time, after the answer is sent; the Drive originals are only read.
  if (isPostgres("PHOTOS")) {
    try {
      const photos = await listPhotosShape();
      after(() => copyDrivePhotos(3).catch((error) => console.error("[photos] Drive copy:", getErrorMessage(error))));
      return NextResponse.json({ success: true, photos, data: photos }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("[photos GET]", getErrorMessage(error));
      return NextResponse.json({ success: false, message: "The photos did not load.", photos: [], data: [] }, { status: 500 });
    }
  }

  if (!GOOGLE_SCRIPT_URL) {
    return NextResponse.json(
      {
        success: false,
        message: "GOOGLE_SCRIPT_URL is missing.",
        photos: [],
        data: [],
      },
      { status: 500 }
    );
  }

  try {
    const url = new URL(GOOGLE_SCRIPT_URL);
    url.searchParams.set("action", "getPhotos");

    // Read-only action — safe to retry after a throw (timeout/network
    // failure).
    const response = await fetchAppsScript(
      url.toString(),
      { method: "GET", cache: "no-store" },
      undefined,
      { retryOn5xx: true, retryOnThrow: true }
    );

    const text = await response.text();

    let data: {
      success?: boolean;
      error?: string;
      message?: string;
      photos?: unknown[];
      data?: unknown[];
    };

    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          success: false,
          message:
            "Google Script did not return valid JSON while loading photos.",
          rawResponse: text,
          photos: [],
          data: [],
        },
        { status: 500 }
      );
    }

    const photos = Array.isArray(data.photos)
      ? data.photos
      : Array.isArray(data.data)
        ? data.data
        : [];

    return NextResponse.json({
      success: data.success !== false,
      message: data.message || data.error || "",
      photos,
      data: photos,
    });
  } catch (error) {
    if (error instanceof AppsScriptFetchError) {
      return NextResponse.json(
        { success: false, message: error.message, photos: [], data: [] },
        { status: error.status }
      );
    }
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error),
        photos: [],
        data: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // DATA_SOURCE_PHOTOS=postgres: the photo goes to Blob storage and its
  // record to Postgres. Apps Script and Google Drive are not involved.
  if (isPostgres("PHOTOS")) {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const saved = await addPhoto(body);
      return NextResponse.json({ success: true, message: "Photo uploaded.", photo: { success: true, photoId: saved.photoId, driveUrl: saved.url } });
    } catch (error) {
      const message = getErrorMessage(error);
      console.error("[photos POST]", message);
      return NextResponse.json({ success: false, message: message.length < 120 && !/sql|syntax|relation|column/i.test(message) ? message : "The photo did not upload. Try again." }, { status: 400 });
    }
  }

  if (!GOOGLE_SCRIPT_URL) {
    return NextResponse.json(
      {
        success: false,
        message: "GOOGLE_SCRIPT_URL is missing.",
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();

    // uploadPhoto appends a new record — not idempotent, so a thrown error
    // (timeout/network failure) is not retried here to avoid risking a
    // duplicate upload. A 5xx means the Apps Script explicitly rejected the
    // request (safe to retry, nothing was written).
    const response = await fetchAppsScript(
      GOOGLE_SCRIPT_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action: "uploadPhoto",
          photo: body,
        }),
      },
      undefined,
      { retryOn5xx: true, retryOnThrow: false }
    );

    const text = await response.text();

    try {
      const data = JSON.parse(text);

      return NextResponse.json({
        success: Boolean(data.success),
        message: data.message || "",
        photo: data,
      });
    } catch {
      return NextResponse.json(
        {
          success: false,
          message:
            "Google Script did not return valid JSON while uploading photo.",
          rawResponse: text,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    if (error instanceof AppsScriptFetchError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown error uploading photo.",
      },
      { status: 500 }
    );
  }
}