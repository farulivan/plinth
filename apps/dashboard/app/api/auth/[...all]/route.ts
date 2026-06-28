import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

// Catch-all for Better Auth: sign-in, magic-link send/verify, session, sign-out
// all live under /api/auth/* on the dashboard (the auth origin, ADR-0005/0008).
export const { GET, POST } = toNextJsHandler(auth);
