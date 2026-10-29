import { connection } from "next/server";
import { listSkillRules } from "@/lib/store/db";
import { LEARNING_THRESHOLD, buildSkillMarkdown, categoryLabel } from "@/lib/store/learning";

/** Exporta una categoría como SKILL.md (reglas activas + umbral). */
export async function GET(request: Request) {
  await connection();
  const category = new URL(request.url).searchParams.get("category") ?? "general";
  const rules = listSkillRules(category)
    .filter((r) => r.status === "active")
    .map((r) => ({ rule: r.rule, evidenceCount: r.evidenceCount }));
  return Response.json(
    {
      category,
      label: categoryLabel(category),
      filename: `adforge-${category}.SKILL.md`,
      threshold: LEARNING_THRESHOLD,
      markdown: buildSkillMarkdown(category, rules),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
