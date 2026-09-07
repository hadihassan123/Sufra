// Sentry error tracking - Phase 3 observability.
//
// The DSN below is safe to expose in client code by design, same
// reasoning as the Supabase anon key in js/supabase-client.js: a
// Sentry DSN only lets a client SEND events to this project, it grants
// no read access and no ability to see other events - Sentry's own
// docs are explicit that DSNs are meant to be public.
//
// Deliberately NOT using browserTracingIntegration (performance
// tracing/spans) - that's a separate, much smaller quota on Sentry's
// free tier than error events, and isn't needed for what this project
// actually wants right now: catching real JS errors and failed RPCs
// before a customer has to report them, which is plain error capturing.
// Can be added later if performance monitoring becomes a real need.
import * as Sentry from '@sentry/browser';

// import.meta.env.PROD is a real build-time flag Vite provides for
// free - true in `npm run build` output, false in `npm run dev`. Skips
// initializing entirely during local development, so testing locally
// never sends noise into the 5,000-errors/month free-tier quota.
if(import.meta.env.PROD){
  Sentry.init({
    dsn: 'https://a068c115a1bc47a3097f6f950746e84a@o4512043811995648.ingest.de.sentry.io/4512043822088272',
    // Free tier is 5,000 errors/month - sending every single error
    // uncapped risks burning that quota on one bad deploy. 1.0 = capture
    // everything for now, since Sufra's real traffic is nowhere near
    // that volume; revisit if that ever changes.
    sampleRate: 1.0,
  });
}

export { Sentry };
