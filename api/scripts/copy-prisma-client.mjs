/**
 * Production build expects dist/lib/prisma.js to require ../generated/prisma.
 * tsc does not emit the Prisma-generated package; copy it after compile.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src", "generated", "prisma");
const dest = path.join(root, "dist", "generated", "prisma");

if (!fs.existsSync(src)) {
  console.error(
    "copy-prisma-client: missing",
    src,
    "\nRun: npx prisma generate"
  );
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log("copy-prisma-client:", path.relative(root, dest));
