"use client";

/**
 * Carga de imágenes para canvas de exportación. El `await` es load-bearing:
 * dibujar o exportar antes del `onload` produce un PNG vacío/transparente
 * que muchos visores (y cualquier conversión a JPG) muestran en NEGRO.
 * `crossOrigin = "anonymous"` mantiene el lienzo exportable.
 */
export function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen para exportar."));
    img.src = url;
  });
}
