import assert from "node:assert/strict";
import { constrainLayers, defaultLayers, sceneTextColor, artDirectedLayers, layoutLayersSchema } from "../src/lib/flyer/layers";
import { drawLayers, inkForBrightness, sampleBusyGrid, zoneBusy, findClearY, pickLogoCorner } from "../src/lib/flyer/layer-render";

const original = defaultLayers("Titular editable", "Apoyo editable", "Consultar", true);
const bounded = constrainLayers({ ...original, headline: { ...original.headline, y: 0 }, cta: { ...original.cta, y: 99 } }, true);
assert.equal(bounded.headline.y, 16);
assert.equal(bounded.cta.y, 74);
assert.deepEqual(layoutLayersSchema.parse(JSON.parse(JSON.stringify(bounded))), bounded);
assert.equal(constrainLayers({ ...original, cta: { ...original.cta, y: 55 } }, false).cta.y, 86);
for (const scene of ["Fondo blanco luminoso", "Pared beige", "Escena crema", "Warm cream background"]) assert.equal(sceneTextColor(scene, "#ffffff"), "#262320");
assert.equal(sceneTextColor("Auto blanco sobre asfalto oscuro", "#ffffff"), "#262320");
assert.equal(sceneTextColor("Fondo nocturno oscuro", "#262320"), "#FFFFFF");
assert.equal(inkForBrightness(.86, "#FFFFFF"), "#262320");
assert.equal(inkForBrightness(.12, "#262320"), "#FFFFFF");

function render(brightness: number, layers = bounded) {
  const drawn: Array<{ text: string; y: number; color: unknown; font: string; shadow: number }> = [];
  let scrims = 0;
  const ctx = {
    font: "", fillStyle: "", textBaseline: "", textAlign: "", shadowColor: "", shadowBlur: 0,
    getImageData(_x: number, _y: number, w: number, h: number) { return { data: new Uint8ClampedArray(w * h * 4).fill(Math.round(brightness * 255)) }; },
    createLinearGradient: () => ({ addColorStop() {} }), fillRect() { scrims++; },
    measureText: (text: string) => ({ width: text.length * 20 }), save() {}, restore() {}, beginPath() {}, roundRect() {}, fill() {},
    fillText(this: CanvasRenderingContext2D, text: string, _x: number, y: number) { drawn.push({ text, y, color: this.fillStyle, font: this.font, shadow: this.shadowBlur }); },
  } as unknown as CanvasRenderingContext2D;
  drawLayers(ctx, layers, 1080, 1920, true);
  return { drawn, scrims };
}
const bright = render(.88, { ...bounded, headline: { ...bounded.headline, color: "#FFFFFF" } });
assert.equal(bright.drawn[0].color, "#262320", "Bright photo wins over a mistaken white JSON color");
assert.equal(bright.scrims, 0, "Bright photos must stay clean");
assert.ok(bright.drawn.every(v=>v.shadow === 0));
const night = render(.1);
assert.equal(night.drawn[0].color, "#FFFFFF");
assert.equal(night.scrims, 1);
assert.ok(night.drawn.every(v=>v.shadow === 0));
assert.ok(night.drawn.some(v=>v.text === "Consultar" && v.y < 1920 * .78));

const editorial = artDirectedLayers("Tu ritmo empieza acá", "Para tus recorridos cotidianos", "Elegí tu próximo paso", 0, "#BA9876", "serif");
const benefits = artDirectedLayers("Seguí en movimiento", "Encontrá el modelo para tus planes", "Consultá tu talle", 1, "#BA9876");
const immersive = artDirectedLayers("La ciudad te espera", null, "Consultá tu talle", 2, "#BA9876");
assert.equal(editorial.headline.fontFamily, "serif");
assert.equal(editorial.headline.fontWeight, 500);
assert.equal(benefits.copyPanel?.y, 0);
assert.equal(benefits.copyPanel?.borderRadius, 0);
assert.equal(benefits.copyPanel?.color, "#2A2421");
assert.equal(benefits.copyPanel?.opacity, .78);
assert.equal(benefits.copyPanel?.blur, 8);
assert.equal(immersive.headline.align, "center");
assert.ok(immersive.cta.y + 3.5 <= 78);
assert.equal(new Set([editorial, benefits, immersive].map(v=>JSON.stringify([v.headline.x,v.headline.y,v.headline.maxWidth,v.headline.align]))).size,3);
for(const layer of [editorial,benefits,immersive]) assert.deepEqual(layoutLayersSchema.parse(JSON.parse(JSON.stringify(layer))),layer);
assert.ok(render(.8,editorial).drawn[0].font.startsWith("500 "));
console.log("OK · contraste real sin sombras, safe zones, Serif media y banda editorial sin parche flotante");

// Encaje anti-sujeto: el texto se aparta de la zona ocupada (cara) a la libre.
const faceLuma = (x: number, y: number) => (x < 50 && y < 45 ? ((x + y) % 7) / 7 : 0.02);
const faceGrid = sampleBusyGrid(faceLuma, 100, 125, 10);
assert.ok(zoneBusy(faceGrid, 0, 60, 0, 45) > zoneBusy(faceGrid, 60, 100, 0, 45), "la zona de la cara debe puntuar ocupada y el fondo libre");
const clear = findClearY(faceGrid, 8, 88, 20, 4, 62, 9);
assert.ok(clear.y > 30, "el titular debe bajar de la cara a la zona libre");
const calmGrid = sampleBusyGrid(() => 0.5, 100, 125, 10);
const calm = findClearY(calmGrid, 8, 88, 20, 4, 62, 8);
assert.equal(calm.y, 8, "en foto pareja se conserva la posición planificada");
console.log("OK · encaje anti-sujeto: el texto evita la zona ocupada");

// Logo: esquina inferior más libre; a igualdad, la derecha por convención.
const busyRight = sampleBusyGrid((x, y) => (x > 60 && y > 80 ? ((x * 3 + y * 7) % 5) / 5 : 0.01), 100, 125, 10);
assert.equal(pickLogoCorner(busyRight, 20, 7).corner, "left", "con derecha ocupada el logo va a la izquierda");
const busyLeft = sampleBusyGrid((x, y) => (x < 40 && y > 80 ? ((x * 3 + y * 7) % 5) / 5 : 0.01), 100, 125, 10);
assert.equal(pickLogoCorner(busyLeft, 20, 7).corner, "right", "con izquierda ocupada el logo va a la derecha");
const calmLogo = pickLogoCorner(calmGrid, 20, 7);
assert.equal(calmLogo.corner, "right", "en foto pareja el logo va a la derecha por convención");
assert.ok(calmLogo.y + 7 <= 100 && calmLogo.x + 20 <= 100, "el logo queda dentro del encuadre");
const storyLogo = pickLogoCorner(calmGrid, 20, 7, 3, 87, 15);
assert.ok(storyLogo.y + 7 <= 87, "en story el logo termina antes del 87% (zona segura)");

// Botón CTA sólido que invade la esquina inferior derecha: aunque el interior del botón sea liso,
// el salto de luminancia y borde hace que pickLogoCorner evite pisar el CTA.
const ctaOnBottomRight = sampleBusyGrid((x, y) => (x >= 60 && x <= 92 && y >= 112 && y <= 121 ? 0.15 : 0.85), 100, 125, 10);
assert.equal(pickLogoCorner(ctaOnBottomRight, 17, 5.5).corner, "left", "un botón CTA sólido en la esquina inferior derecha debe mover el logo a la izquierda");

// Cuando ambas esquinas inferiores están ocupadas (ej. pills a la izquierda + CTA a la derecha),
// el logo sube automáticamente a una esquina superior despejada respetando minTopPct.
const busyBothBottom = sampleBusyGrid((x, y) => (y > 95 ? ((x * 5 + y * 3) % 6) / 6 : 0.82), 100, 125, 10);
const topFallback = pickLogoCorner(busyBothBottom, 17, 5.5, 3, 87, 15);
assert.ok(topFallback.corner === "top-right" || topFallback.corner === "top-left", "si ambas esquinas inferiores están ocupadas, el logo sube a esquina superior libre");
assert.equal(topFallback.y, 15, "en story la esquina superior respeta el safe zone de 15%");
console.log("OK · logo en la esquina más libre (evita CTA sólido y usa fallback superior cuando hace falta)");

// Esquina fijada por el usuario: se respeta aunque el auto-pick elegiría otro lado.
assert.equal(pickLogoCorner(busyRight, 20, 7, 3, 100 - 2.5, 3, "right").corner, "right", "con esquina fijada a la derecha se respeta aunque esté ocupada");
assert.equal(pickLogoCorner(ctaOnBottomRight, 17, 5.5, 3, 100 - 2.5, 3, "left").corner, "left", "con esquina fijada a la izquierda se respeta aunque el CTA esté ahí");
const pinnedStory = pickLogoCorner(calmGrid, 20, 7, 3, 87, 15, "left");
assert.ok(pinnedStory.corner === "left" && pinnedStory.y + 7 <= 87, "la esquina fijada respeta el safe zone de story");
console.log("OK · logo fijado por el usuario (izquierda/derecha con safe zones)");
