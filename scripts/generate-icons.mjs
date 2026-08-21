/**
 * Genera los iconos de la PWA a partir del SVG de la marca.
 *   npm run icons
 *
 * Se ejecuta a mano: los iconos casi nunca cambian y no merecen estar en el
 * build de cada despliegue.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const OUT = join(process.cwd(), "public", "icons");

const BACKGROUND = "#0B1720";
const RING = "#39C98A";

/** El anillo abierto de CERO, con margen para el recorte "maskable". */
function markSvg(size, inset) {
  const r = (size / 2) * inset;
  const stroke = size * 0.075;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BACKGROUND}"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${r}"
          fill="none" stroke="${RING}" stroke-width="${stroke}"
          stroke-linecap="round"
          stroke-dasharray="${2 * Math.PI * r * 0.88} ${2 * Math.PI * r}"
          transform="rotate(-90 ${size / 2} ${size / 2})"/>
</svg>`;
}

const TARGETS = [
  { file: "icon-192.png", size: 192, inset: 0.62 },
  { file: "icon-512.png", size: 512, inset: 0.62 },
  { file: "apple-touch-icon.png", size: 180, inset: 0.62 },
  // Maskable: Android recorta hasta un 20 % del borde.
  { file: "icon-maskable-512.png", size: 512, inset: 0.46 },
];

await mkdir(OUT, { recursive: true });

for (const { file, size, inset } of TARGETS) {
  const png = await sharp(Buffer.from(markSvg(size, inset))).png().toBuffer();
  await writeFile(join(OUT, file), png);
  console.log(`✓ ${file} (${size}×${size})`);
}
