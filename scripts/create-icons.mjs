/** Derive web assets from the supplied official logo; preserve original artwork. */
import sharp from "sharp";
import { mkdir, unlink } from "node:fs/promises";
const source = "public/branding/spotlight-transparent.png";
await mkdir("public/branding", { recursive: true });
const logo = await sharp(source).trim({ threshold: 10 }).toBuffer();
// The original is a portrait lockup. Isolate its symbol above the wordmark for compact app surfaces.
const { width, height } = await sharp(logo).metadata();
const symbol = await sharp(logo)
  .extract({ left: 0, top: 0, width, height: Math.round(height * 0.755) })
  .toBuffer();
await sharp(logo)
  .resize({ width: 480, withoutEnlargement: true })
  .png()
  .toFile("public/branding/spotlight-logo-transparent.png");
await sharp(symbol)
  .resize({ width: 160, withoutEnlargement: true })
  .png()
  .toFile("public/branding/spotlight-symbol-transparent.png");
for (const [name, size, ratio] of [
  ["icon-192.png", 192, 0.82],
  ["icon-512.png", 512, 0.82],
  ["icon-maskable.png", 512, 0.6],
  ["apple-touch-icon.png", 180, 0.82],
]) {
  const overlay = await sharp(symbol)
    .resize({
      width: Math.round(size * ratio),
      height: Math.round(size * ratio),
      fit: "inside",
    })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background:
        name === "icon-maskable.png" || name === "apple-touch-icon.png"
          ? "#f7f7f5"
          : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: overlay, gravity: "centre" }])
    .png()
    .toFile(`public/${name}`);
}
// Remove the placeholder mark so future changes cannot accidentally reuse it.
await unlink("public/brand.svg").catch((error) => {
  if (error.code !== "ENOENT") throw error;
});
