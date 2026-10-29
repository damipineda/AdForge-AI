import { connection } from "next/server";
import { listSkillRules } from "@/lib/store/db";
import { LEARNING_THRESHOLD, categoryLabel } from "@/lib/store/learning";

/** Reglas del skill (candidatas y activas), opcionalmente por categoría. */
export async function GET(request: Request) {
  await connection();
  const category = new URL(request.url).searchParams.get("category") ?? undefined;
  const rules = listSkillRules(category || undefined);
  return Response.json(
    { rules, threshold: LEARNING_THRESHOLD, label: category ? categoryLabel(category) : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
