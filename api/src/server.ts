import { env } from "./config/env";
import { buildApp } from "./app";

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(
      { host: env.HOST, port: env.PORT, webRoot: env.POLODECK_WEB_ROOT ?? null },
      "PoloDeck Core listening"
    );
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === "EADDRINUSE") {
      app.log.error(
        { port: env.PORT },
        "Another program is using PoloDeck’s network port. Stop that program or change PORT, then try again."
      );
    } else {
      app.log.error(err);
    }
    process.exit(1);
  }
}

start();
