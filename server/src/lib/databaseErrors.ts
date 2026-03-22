/**
 * Detect Prisma / Postgres connection failures so we can return a friendly API response.
 */
function messageLooksLikeDbUnreachable(message: string): boolean {
  const m = message;
  // Prisma connection / init (ASCII or curly apostrophe in "Can't")
  if (/can['’]t reach database server/i.test(m)) return true;
  if (/reach database server at/i.test(m)) return true;
  if (/please make sure your database server is running/i.test(m)) return true;
  // Long Prisma client error that embeds connection failure
  if (/Invalid `.*` invocation/i.test(m) && /database server|localhost:\d+/i.test(m)) {
    return true;
  }
  if (/connection refused/i.test(m) && /5432|postgres|database/i.test(m)) return true;
  return false;
}

export function isDatabaseConnectionError(err: unknown): boolean {
  if (err == null) return false;

  // Walk message + optional nested cause (some Prisma errors wrap the real message)
  const messages: string[] = [];
  let cur: unknown = err;
  let depth = 0;
  while (cur != null && depth < 6) {
    if (typeof cur === "object" && cur !== null && "message" in cur) {
      const m = (cur as { message?: unknown }).message;
      if (typeof m === "string") messages.push(m);
    } else if (typeof cur === "string") {
      messages.push(cur);
    }
    const next = typeof cur === "object" && cur !== null && "cause" in cur ? (cur as { cause: unknown }).cause : null;
    cur = next;
    depth += 1;
  }

  const combined = messages.join("\n");
  if (combined && messageLooksLikeDbUnreachable(combined)) return true;

  if (typeof err === "object" && err !== null) {
    const e = err as { code?: string; name?: string };

    const prismaConnectionCodes = new Set([
      "P1000",
      "P1001",
      "P1002",
      "P1017",
    ]);
    if (typeof e.code === "string" && prismaConnectionCodes.has(e.code)) {
      return true;
    }

    // PrismaClientInitializationError, etc.
    if (typeof e.name === "string" && /PrismaClientInitialization|PrismaClientRustPanic/i.test(e.name)) {
      return true;
    }
  }

  return false;
}
