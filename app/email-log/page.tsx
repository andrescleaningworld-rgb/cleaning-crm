"use client";

// Office -> Email log: every email (and new-account offer text) the app has
// sent, newest first, including the old log from before Oct 9, 2026.

import { Screen } from "@/app/ui";
import EmailLogList from "../components/email-log-list";

export default function EmailLogPage() {
  return (
    <Screen title="Email log" subtitle="Every email the app sends: sub packets, documents, transfer proposals, offers, Welcome Packets, portal invites." backHref="/">
      <EmailLogList />
    </Screen>
  );
}
