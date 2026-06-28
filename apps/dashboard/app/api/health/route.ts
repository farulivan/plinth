// Public liveness probe for Fly. The proxy matcher excludes /api, so this needs
// no session and no db — a suspended machine resumes and answers it fast.
export function GET() {
  return Response.json({ status: "ok" });
}
