/**
 * Validador determinístico del copy: lo que el modelo promete ("solo hechos
 * del empaque, voseo paraguayo") se verifica con código, no con fe.
 *
 * Dos capas:
 * 1) `autoFix`: reemplazos exactos de léxico prohibido y formas de "tú" por
 *    voseo. Determinístico, sin red: garantiza que esos tokens no salgan.
 * 2) `findViolations`: lo que queda (duplicación literal entre superficies)
 *    va a un intento de reparación con modelo; si persiste, se advierte.
 */

export type CopySurface = { id: string; text: string };
export type CopyViolation = { surface: string; kind: "banned" | "register" | "duplicate" | "catalog" | "color-concept"; match: string };

type Replacement = { pattern: RegExp; fix: string; label: string };

/** Porteñismos, burocratese y jerga → español comercial paraguayo. Orden:
 * frases largas primero para que ganen sobre palabras sueltas. */
const LEXICON: Replacement[] = [
  { pattern: /\bcuando pinten\b/gi, fix: "cuando quieras", label: "porteñismo" },
  { pattern: /\bpara la ronda del finde\b/gi, fix: "para el fin de semana", label: "porteñismo" },
  { pattern: /\bdel finde\b/gi, fix: "del fin de semana", label: "porteñismo" },
  { pattern: /\bfinde\b/gi, fix: "fin de semana", label: "porteñismo" },
  { pattern: /\bre va\b/gi, fix: "es ideal", label: "porteñismo" },
  { pattern: /\bcopados?\b/gi, fix: "buenos", label: "porteñismo" },
  { pattern: /\bzarpados?\b/gi, fix: "increíbles", label: "porteñismo" },
  { pattern: /\blaburo\b/gi, fix: "trabajo", label: "porteñismo" },
  { pattern: /\bmorfar\b/gi, fix: "comer", label: "porteñismo" },
  { pattern: /\bcon mención libre de gluten\b/gi, fix: "sin gluten", label: "burocratese" },
  { pattern: /\bmención libre de gluten\b/gi, fix: "sin gluten", label: "burocratese" },
  { pattern: /\bmención\b/gi, fix: "", label: "burocratese" },
  { pattern: /\bcon rótulo sin gluten\b/gi, fix: "sin gluten", label: "burocratese" },
  { pattern: /\brótulo sin gluten\b/gi, fix: "sin gluten", label: "burocratese" },
  { pattern: /\brótulo\b/gi, fix: "", label: "burocratese" },
  { pattern: /\s+declarados?\b/gi, fix: "", label: "burocratese" },
  { pattern: /\btené stock\b/gi, fix: "tené siempre", label: "jerga" },
  { pattern: /\bstock práctico\b/gi, fix: "reserva práctica", label: "jerga" },
  { pattern: /\bstock\b/gi, fix: "reserva", label: "jerga" },
];

/** Formas de "tú"/tercera persona → voseo imperativo. `\b` estricto: no toca
 * "Preparalas" (ya voseo) porque el límite de palabra no coincide dentro. */
const REGISTER: Replacement[] = [
  { pattern: /\btrae\b/g, fix: "traé", label: "registro" },
  { pattern: /\bTrae\b/g, fix: "Traé", label: "registro" },
  { pattern: /\bprepara\b/gi, fix: "prepará", label: "registro" },
  { pattern: /\barma\b/gi, fix: "armá", label: "registro" },
  { pattern: /\bcompra\b/gi, fix: "comprá", label: "registro" },
  { pattern: /\bguarda\b/gi, fix: "guardá", label: "registro" },
  { pattern: /\bcocina\b/gi, fix: "cociná", label: "registro" },
  { pattern: /\bmira\b/gi, fix: "mirá", label: "registro" },
  { pattern: /\bsuma\b/gi, fix: "sumá", label: "registro" },
  { pattern: /\babre\b/gi, fix: "abrí", label: "registro" },
  { pattern: /\bdisfruta\b/gi, fix: "disfrutá", label: "registro" },
  { pattern: /\bconsulta\b/gi, fix: "consultá", label: "registro" },
  { pattern: /\bconoce\b/gi, fix: "conocé", label: "registro" },
  { pattern: /\bten\b/gi, fix: "tené", label: "registro" },
];

function preserveCase(match: string, fix: string): string {
  if (match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()) {
    return fix[0].toUpperCase() + fix.slice(1);
  }
  return fix;
}

function collapseSpaces(text: string): string {
  return text.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
}

/**
 * Aplica los reemplazos exactos y devuelve qué corrigió. El léxico y el
 * registro son reglas del español rioplatense/paraguayo: en `pt`/`en` no se
 * tocan ("stock" en inglés es palabra normal); la duplicación se revisa en
 * todos los idiomas.
 */
export function autoFix(surfaces: CopySurface[], locale: string): { surfaces: CopySurface[]; applied: string[] } {
  const applied: string[] = [];
  const rules = locale === "es" ? [...LEXICON, ...REGISTER] : [];
  const fixed = surfaces.map((surface) => {
    let text = surface.text;
    for (const { pattern, fix, label } of rules) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        pattern.lastIndex = 0;
        text = text.replace(pattern, (m) => preserveCase(m, fix));
        applied.push(`${surface.id}: ${label}`);
      }
    }
    return { ...surface, text: collapseSpaces(text) };
  });
  return { surfaces: fixed, applied: [...new Set(applied)] };
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
}

/**
 * Viola si una superficie repite literalmente (o contiene) un fragmento de
 * ≥6 palabras de otra superficie: subtítulo, pills y captions deben
 * parafrasear, no duplicar.
 *
 * Dos motivos de oficio que el prompt no logra imponer solo (valen para
 * CUALQUIER producto: no hay vocabulario de categoría en los patrones):
 * - `catalog`: el apoyo abre con fórmula de catálogo (demostrativo +
 *   sustantivo del objeto, ej. "Esta zapatilla…", "Este termo…",
 *   "Esta hamburguesa…"). Se excluyen aperturas temporales o copulares
 *   ("Este fin de semana…", "Esta es tu oportunidad…"). Se revisan apoyos y
 *   subtítulo, no titulares ni CTAs.
 * - `color-concept`: el hook o concepto de story usa el color como idea
 *   central ("este negro", "mirá este gris"). Solo superficies de story.
 */
const DEMONSTRATIVE_OPEN = /^(esta|este|estos|estas|ésta|éste|éstos|éstas)\s+([^\s.,;:!?]+)/i;
/** Palabra siguiente al demostrativo que indica que NO es el objeto ("este fin…", "esta es…"). */
const NON_PRODUCT_OPENERS = new Set([
  "fin", "semana", "semanas", "mes", "meses", "año", "ano", "manana", "mañana",
  "noche", "noches", "tarde", "tardes", "dia", "día", "dias", "días",
  "vez", "veces", "es", "son", "era", "eran", "fue", "fueron", "hay",
]);
const COLOR_AS_IDEA = /\beste\s+(negro|blanco|gris|rojo|azul|verde|negra|blanca|gris|roja|azul|verde)\b/i;

export function findViolations(surfaces: CopySurface[], locale: string): CopyViolation[] {
  const violations: CopyViolation[] = [];
  const norms = surfaces.map((s) => ({ id: s.id, words: normalize(s.text).split(" ").filter(Boolean) }));
  for (let i = 0; i < norms.length; i++) {
    for (let j = i + 1; j < norms.length; j++) {
      const a = norms[i];
      const b = norms[j];
      if (a.words.length < 6 || b.words.length < 6) continue;
      const [short, long] = a.words.length <= b.words.length ? [a, b] : [b, a];
      const longJoined = ` ${long.words.join(" ")} `;
      for (let k = 0; k + 6 <= short.words.length; k++) {
        const fragment = short.words.slice(k, k + 6).join(" ");
        if (longJoined.includes(` ${fragment} `)) {
          violations.push({ surface: `${short.id} ↔ ${long.id}`, kind: "duplicate", match: fragment });
          break;
        }
      }
    }
  }
  // Re-scan de léxico: lo que el autoFix no cubrió (flexiones nuevas).
  const rules = locale === "es" ? [...LEXICON, ...REGISTER] : [];
  const remaining = surfaces.flatMap((s) =>
    rules.flatMap(({ pattern, label }) => {
      pattern.lastIndex = 0;
      const m = pattern.exec(s.text);
      return m ? [{ surface: s.id, kind: (label === "registro" ? "register" : "banned") as CopyViolation["kind"], match: m[0] }] : [];
    }),
  );
  // Oficio publicitario: apertura de catálogo en apoyos y color como idea en story.
  for (const s of surfaces) {
    const text = s.text.trim();
    if (/body|subheadline/i.test(s.id)) {
      DEMONSTRATIVE_OPEN.lastIndex = 0;
      const m = DEMONSTRATIVE_OPEN.exec(text);
      const next = m?.[2].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") ?? "";
      if (m && !NON_PRODUCT_OPENERS.has(next)) {
        violations.push({ surface: s.id, kind: "catalog", match: text.split(/\s+/).slice(0, 6).join(" ") });
      }
    }
    if (/^story/i.test(s.id)) {
      COLOR_AS_IDEA.lastIndex = 0;
      const m = COLOR_AS_IDEA.exec(text);
      if (m) violations.push({ surface: s.id, kind: "color-concept", match: m[0] });
    }
  }
  return [...violations, ...remaining];
}
