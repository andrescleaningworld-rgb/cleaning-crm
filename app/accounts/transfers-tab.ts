"use client";

// Accounts Center → Transfers: the Accounts screen's transfer proposal
// builder, in its own tab (it used to be "Transfer proposal" in the More
// menu). The tab wraps <AccountsPage /> in this provider set to true, and the
// page then opens straight on the builder (app/accounts/page.tsx).
import { createContext } from "react";

export const TransfersTabContext = createContext(false);
