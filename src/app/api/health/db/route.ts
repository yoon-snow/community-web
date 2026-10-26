import { getMongoClient } from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };

  try {
    const client = await getMongoClient();
    await client.db().command({ ping: 1 }, { timeoutMS: 5_000 });
    return Response.json({ ok: true }, { headers });
  } catch {
    // Never return or log driver errors: they may contain connection details.
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
