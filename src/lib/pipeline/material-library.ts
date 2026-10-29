/** Criterios abiertos para que el contexto visual nazca del producto. */
export const MATERIAL_LIBRARY = [
  "DIRECCIÓN CONTEXTUAL: elegí el entorno, materiales y recursos gráficos a partir del producto, su uso y el concepto de cada pieza; justificá su relación con la idea. No uses una lista fija de superficies por categoría.",
  "Podés elegir fotografía, ilustración, formas gráficas, fondo liso o una combinación si aporta a la campaña. Una mesa, una cocina, un podio o una textura son opcionales, no requisitos. Evitá objetos decorativos sin función y estereotipos culturales.",
].join("\n");

export const MATERIAL_DISTINCTNESS_RULE = [
  "DIVERSIDAD DE DIRECCIÓN: diferenciá las piezas por idea, escala, encuadre, composición y recursos visuales, no solo por color, material o iluminación. La identidad de campaña puede repetirse cuando sea útil; evitá recetas asignadas por número de pieza.",
  "Elegí escenas, soportes y texturas únicamente cuando ayuden a comunicar el producto o el concepto; no impongas superficies físicas ni fondos estandarizados.",
].join("\n");

export const MATERIAL_RETRY_SUGGESTIONS =
  "una alternativa visual concreta derivada del producto y del argumento de la pieza, con otra composición y contexto; no propongas una superficie genérica por defecto";

/**
 * Bloque de reglas aprendidas de campañas anteriores (skill in-app).
 * Vacío cuando no hay reglas activas para no meter ruido al prompt.
 */
export function learnedRulesBlock(rules: string[]): string {
  if (rules.length === 0) return "";
  return [
    "REGLAS APRENDIDAS DE CAMPAÑAS ANTERIORES (evidencia real de piezas generadas, ya superaron el umbral):",
    ...rules.map((rule) => `- ${rule}`),
    "Priorizalas cuando apliquen al producto y al concepto actuales.",
  ].join("\n");
}
