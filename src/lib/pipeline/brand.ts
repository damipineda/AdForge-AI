/**
 * Kit de marca tal como lo consume el pipeline: identidad + paleta + si hay
 * logo. Sin kit (null) el agente diseña libremente y rigen las reglas
 * default (nada de logos inventados).
 */
export type LogoPosition = "auto" | "left" | "right";

export type BrandContext = {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  hasLogo: boolean;
  logoPosition?: LogoPosition;
};

/** Bloque para el planificador de copy: nombre del negocio + paleta. */
export function brandCopyBlock(brand: BrandContext | null | undefined): string {
  if (!brand) return "";
  const lines = [
    `KIT DE MARCA DEL NEGOCIO${brand.name ? ` ("${brand.name}")` : ""}: usá estos datos cuando aporten, sin forzarlos.`,
    `- Paleta de marca: primario ${brand.primary}, secundario ${brand.secondary}, acento ${brand.accent}. Que la dirección de arte dialogue con ella (fondos, acentos, CTA) cuando el concepto lo pida; si el concepto pide otra cosa, la marca manda en el logo y el concepto en el resto.`,
  ];
  if (brand.name) {
    lines.push(
      `- Mencioná "${brand.name}" con naturalidad SOLO en las descripciones externas del post (captionInstagram y captionFacebook) cuando corresponda.`,
    );
    if (brand.hasLogo) {
      lines.push(
        `- REGLA CRÍTICA ANTI-DUPLICACIÓN DE LOGO: la imagen final ya lleva estampado automáticamente el archivo de logo real de "${brand.name}" del kit de marca. Por lo tanto, está TERMINANTEMENTE PROHIBIDO escribir "${brand.name}" dentro del arte de la imagen (ni en hook, ni en body, ni en featurePills, ni en cta) y PROHIBIDO pedir en \`artDirection\` o \`visualWorld\` que se escriba o dibuje "${brand.name}", un logo tipográfico o una firma de marca en alguna esquina o cabecera. Si escribís "${brand.name}" en el arte, el logo aparecerá dos veces (uno falso con letras y el real del kit).`,
      );
    }
  }
  return lines.join("\n");
}

/**
 * Limpia de una dirección de arte cualquier mención accidental al nombre del
 * comercio cuando el kit ya tiene logo gráfico, evitando que Muse Image imprima
 * el nombre en letras además del logo real compuesto en Canvas.
 */
export function stripBrandNameFromDirection(direction: string, brand: BrandContext | null | undefined): string {
  if (!brand?.hasLogo || !brand.name || brand.name.trim().length < 2) return direction;
  const escaped = brand.name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameRegex = new RegExp(`\\b${escaped}\\b`, "gi");
  return direction
    .replace(new RegExp(`(?:logo(?:tipo)?|marca|texto|firma|sello|insignia)\\s+(?:de\\s+)?["'«»]?${escaped}["'«»]?`, "gi"), "espacio despejado sin texto de marca")
    .replace(nameRegex, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Paleta de referencia para los prompts de imagen. Vacío sin kit. */
export function brandPaletteLine(brand: BrandContext | null | undefined): string {
  if (!brand) return "";
  return `Paleta de marca (referencia, no plantilla obligatoria): ${brand.primary}, ${brand.secondary}, acento ${brand.accent}.`;
}

/**
 * Cláusula de logo: el logo real se compone nítido en el cliente, así que el
 * modelo reserva una esquina limpia y NO dibuja ni inventa ninguna marca.
 * Si el usuario fijó la esquina (left/right), la reserva es esa; en auto se
 * reserva por defecto la derecha pero el compositor puede usar la más libre.
 */
export function brandLogoClause(brand: BrandContext | null | undefined): string {
  if (!brand?.hasLogo) return "";
  const pos = brand.logoPosition === "left" || brand.logoPosition === "right" ? brand.logoPosition : "auto";
  const forbidName = brand.name?.trim()
    ? ` PROHIBIDO escribir la palabra "${brand.name.trim()}" en letras en ninguna parte de la imagen (ni en esquinas superiores, ni en cabeceras, ni al pie): el único logo válido es el archivo gráfico del kit que el sistema superpone después; si escribís "${brand.name.trim()}" con tipografía, quedará duplicado.`
    : "";
  if (pos === "left") {
    return `LOGO REAL: el logo de la marca se compone aparte, nítido, en la esquina inferior IZQUIERDA fijada por el usuario. Reservá despejada la esquina inferior izquierda (el 24% izquierdo × 12% inferior del lienzo completamente libre de texto, pills, botón CTA y productos) y NO dibujes ningún logo, isotipo, sello ni texto de marca en ninguna esquina: ni el real ni uno inventado.${forbidName} El botón CTA ocupa como máximo el 70% del ancho del lienzo, termina después del 26% horizontal si está abajo, y NUNCA invade la esquina inferior izquierda reservada al logo.`;
  }
  if (pos === "right") {
    return `LOGO REAL: el logo de la marca se compone aparte, nítido, en la esquina inferior DERECHA fijada por el usuario. Reservá despejada la esquina inferior derecha (el 24% derecho × 12% inferior del lienzo completamente libre de texto, pills, botón CTA y productos) y NO dibujes ningún logo, isotipo, sello ni texto de marca en ninguna esquina: ni el real ni uno inventado.${forbidName} El botón CTA ocupa como máximo el 70% del ancho del lienzo, termina antes del 74% horizontal si está abajo, y NUNCA invade la esquina inferior derecha reservada al logo.`;
  }
  return `LOGO REAL: el logo de la marca se compone aparte, nítido, en una esquina inferior libre. Reservá despejada la esquina inferior derecha (el 24% derecho × 12% inferior del lienzo completamente libre de texto, pills, botón CTA y productos) y NO dibujes ningún logo, isotipo, sello ni texto de marca en ninguna esquina: ni el real ni uno inventado.${forbidName} El botón CTA ocupa como máximo el 70% del ancho del lienzo, termina antes del 74% horizontal si está abajo, y NUNCA invade la esquina reservada al logo.`;
}
