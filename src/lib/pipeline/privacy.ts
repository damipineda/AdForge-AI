/** Heurística conservadora para evitar que matrículas pasen al texto público.
 * No detecta todos los formatos ni elimina información de las imágenes. */
export function redactSensitiveText(value: string): string {
  return value
    .replace(/\b[A-Z]{3,4}[-\s]*\d{3,4}\b/g, "[matrícula oculta]")
    .replace(/\b[A-Z]{3}\d[A-Z]\d{2}\b/g, "[matrícula oculta]")
    .replace(/\b(?:patente|matr[ií]cula|chapa|placa|license plate)\s*(?:n[úu]mero|n[º°o.]|es|:)\s*[:#-]?\s*[a-z0-9-]{4,10}\b/gi, "matrícula oculta");
}

export function redactSensitiveValues<T>(value: T): T {
  if (typeof value === "string") return redactSensitiveText(value) as T;
  if (Array.isArray(value)) return value.map(redactSensitiveValues) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactSensitiveValues(item)])) as T;
  return value;
}
