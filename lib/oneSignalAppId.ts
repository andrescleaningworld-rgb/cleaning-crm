// Shared between the client-side OneSignal.init() call
// (app/components/OneSignalInit.tsx) and the server-side push send
// (lib/push.ts) so the two can never drift apart. Not a secret — this id is
// shipped to every browser via OneSignal.init() regardless of where else
// it's referenced. To switch to a different OneSignal app, this is the only
// place to change.
export const ONESIGNAL_APP_ID = "1812df0b-4118-457e-9a38-f484bf0337a9";
