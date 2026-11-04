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
 * Dirección de arte dinámica: estructura publicitaria en 3 niveles, 4 esquemas
 * reales de composición y morfología variada de CTA (el CTA no siempre es un botón).
 */
export const DYNAMIC_ART_DIRECTION = [
  "DIRECCIÓN DE ARTE Y COMPOSICIÓN PUBLICITARIA (principios de agencia, sin plantillas fijas):",
  "1. ESTRUCTURA EN 3 NIVELES Y REGLA DE LOS 3 SEGUNDOS: (a) Encabezado o Gancho (Atención): elemento más grande e impactante en la parte superior o foco principal; en menos de 3 segundos debe entenderse qué vendés u ofrecés. (b) Mensaje Principal (Interés y Deseo): en la zona media o lateral con mucho AIRE (espacio negativo) alrededor para que no abrume, usando viñetas cortas (pills) o una frase breve que explique el beneficio principal, fecha u oferta. (c) Cierre y Acción (CTA): última parada del ojo en la parte inferior o esquina estratégica, con CONTRASTE AGRESIVO (fondo oscuro → letras/CTA claros y luminosos; fondo claro → letras/CTA oscuros o vibrantes) y DIRECCIONALIDAD (la luz, la perspectiva del producto o líneas/flechas discretas apuntan hacia el CTA).",
  "2. LOS 4 ESQUEMAS DE COMPOSICIÓN (elegí según qué deben ver primero, dónde va el flyer y la personalidad de la marca; PROHIBIDO repetir el mismo esquema en Feed V1, Feed V2 y Story, y PROHIBIDO escribir el nombre del negocio con letras en una esquina porque el logo real del kit se estampa aparte):",
  "   - Composición de Lectura en 'Z' (ideal para catálogos, retail, combos o menús): recorrido ocular desde el gancho principal arriba-izquierda → detalle o promesa arriba-derecha → diagonal central con producto y beneficios → cierre CTA en zona inferior despejada.",
  "   - Composición Central o Radial (ideal para eventos, quintas, fiestas, lanzamientos o producto héroe potente): sujeto o escena central dominante que genera emoción, con datos clave y CTA distribuidos alrededor o en los márgenes de forma minimalista.",
  "   - Composición Minimalista de Espacio Negativo (ideal para marcas premium, vehículos, moda o diseño de autor): gran proporción del flyer con espacio negativo limpio (aire visual generoso, textura sutil o bokeh profundo), mensaje corto y elegante en un bloque focal y cierre tipográfico limpio sin botones pesados.",
  "   - Composición de Cuadrícula o Bloques Modulares (ideal para multiproducto, combos, ferias o listados): organiza productos y beneficios en bloques ordenados y el cierre/CTA unifica todo al fondo.",
  "3. EL CTA NO SIEMPRE ES UN BOTÓN (MORFOLOGÍA DE CIERRE): variá cómo se presenta el CTA entre las piezas en lugar de dibujar siempre un botón web redondeado abajo: (a) UNA FRASE CONTUNDENTE AL FINAL en tipografía grande y bold directo sobre el fondo con línea de acento o flecha direccional (sin caja de botón, ej. '¡RESERVÁ TU LUGAR AHORA!', '¡LLEVÁTELO HOY!'), (b) UN RECUADRO O BLOQUE DESTACADO de cierre (cinta geométrica o tarjeta de alto contraste con la acción y el precio/canal), (c) UN CUPÓN O SELLO DESTACADO con borde punteado o insignia cuando sea una promo/oferta, o (d) un callout compacto lateral con icono de acción.",
  "4. PROFUNDIDAD, FÍSICA Y PROPORCIÓN: agrupá los elementos con profundidad real, plano de apoyo compartido y jerarquía clara (héroe en primer plano nítido, secundarios agrupados con solapamiento parcial 15-25% sin tapar marcas principales). PROHIBIDO filas horizontales planas de borde a borde, PROHIBIDO productos flotando en distintos niveles sin superficie continua, y PROHIBIDO tarjetas blancas opacas que tapen los productos.",
].join("\n");

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
