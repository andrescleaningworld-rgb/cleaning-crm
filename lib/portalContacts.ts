// Where the customer portal sends people and notices. Plain TS with no
// server imports, so the pages and the server use the same two addresses.
//
//   BILLING_EMAIL   questions about a bill ("My bill", "Contact us"); a
//                   billing question sent from the portal goes here only
//   SERVICE_EMAIL   service: "Report a problem" and "Request extra cleaning"
//                   notices go here and only here

export const BILLING_EMAIL = "info@cleaningworldinc.com";
export const SERVICE_EMAIL = "crm@cleaningworldinc.com";
