/**
 * Copy Pi kiosk artifacts from repo-root pi/kiosk into web-app/public/kiosk
 * so nginx serves them next to setup-screen.html at /kiosk/*.
 */
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webAppRoot = join(__dirname, "..");
const piKiosk = join(webAppRoot, "..", "pi", "kiosk");
const dest = join(webAppRoot, "public", "kiosk");

if (!existsSync(piKiosk)) {
  console.warn(`sync-kiosk: skip — no directory ${piKiosk}`);
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
let n = 0;
for (const name of readdirSync(piKiosk)) {
  const src = join(piKiosk, name);
  if (statSync(src).isFile()) {
    const out = join(dest, name);
    cpSync(src, out);
    if (name.endsWith(".sh")) chmodSync(out, 0o755);
    n += 1;
  }
}
console.log(`sync-kiosk: copied ${n} file(s) to public/kiosk/`);
