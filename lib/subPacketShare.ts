// "Send Sub Packet" share words: the short text message with the packet link
// (English, Spanish, Portuguese, as the sub portal invite) and how each way of
// sharing is written in the account's History. Plain TS, safe in the browser.
// The link itself: lib/subPacketLink.ts.

export type PacketShareMethod = "text" | "copy" | "qr" | "email";

export const PACKET_SHARE_LABEL: Record<PacketShareMethod, string> = {
  text: "text",
  copy: "copied link",
  qr: "QR code",
  email: "email",
};

export const isPacketShareMethod = (value: unknown): value is PacketShareMethod => typeof value === "string" && value in PACKET_SHARE_LABEL;

/** The text message: who it is from, the account, one line in each language, the link. */
export function subPacketShareText(accountName: string, url: string): string {
  return [
    `Cleaning World – ${accountName || "New account"}`,
    "Your new account packet / Su paquete de cuenta nueva / Seu pacote de conta nova:",
    url,
  ].join("\n");
}
