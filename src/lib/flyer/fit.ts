/**
 * Estrategia de encuadre para exportar el arte IA a dimensiones exactas, sin
 * deformar jamás. Pura (sin DOM) para que tenga cobertura en tests:
 * - `crop`: el aspecto del arte coincide (desvío ≤ tolerancia) → recorte
 *   centrado proporcional + escalado al tamaño objetivo. Un 3:4 a 4:5 pierde
 *   solo 6,25% de alto, por eso los prompts piden elementos clave en el 90%
 *   central.
 * - `extend`: desvío mayor (ej. arte 3:4 para story 9:16) → el arte va
 *   completo y centrado sobre una extensión ambiental; la UI lo señaliza con
 *   el badge "Arte extendido".
 */

export type FitMode = "crop" | "extend";

export function fitStrategy(
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
  tolerance = 0.12,
): { mode: FitMode; skew: number } {
  if (!srcWidth || !srcHeight || !dstWidth || !dstHeight) return { mode: "extend", skew: 1 };
  const skew = Math.abs(srcWidth / srcHeight - dstWidth / dstHeight) / (dstWidth / dstHeight);
  return { mode: skew <= tolerance ? "crop" : "extend", skew };
}
