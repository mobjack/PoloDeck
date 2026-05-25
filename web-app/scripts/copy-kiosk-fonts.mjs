/**
 * Copy seven-segment kiosk fonts into public/ so Vite/nginx serve them in dist.
 * Run via prebuild / predev (requires `dseg` npm package).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dsegFonts = path.join(root, "node_modules", "dseg", "fonts");
const dest = path.join(root, "public", "fonts");

const copies = [
  ["DSEG7-Classic/DSEG7Classic-Bold.woff2", "DSEG7Classic-Bold.woff2"],
  ["DSEG14-Classic/DSEG14Classic-Bold.woff2", "DSEG14Classic-Bold.woff2"],
];

if (!fs.existsSync(dsegFonts)) {
  console.error("copy-kiosk-fonts: run npm install (missing dseg package)");
  process.exit(1);
}

fs.mkdirSync(dest, { recursive: true });

for (const [fromRel, toName] of copies) {
  const from = path.join(dsegFonts, fromRel);
  const to = path.join(dest, toName);
  if (!fs.existsSync(from)) {
    console.error(`copy-kiosk-fonts: missing ${from}`);
    process.exit(1);
  }
  fs.copyFileSync(from, to);
  console.log(`copy-kiosk-fonts: ${toName}`);
}
