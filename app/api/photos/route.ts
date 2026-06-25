import { NextRequest, NextResponse } from "next/server";

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}

export async function GET() {
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

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });

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

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        action: "uploadPhoto",
        photo: body,
      }),
    });

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