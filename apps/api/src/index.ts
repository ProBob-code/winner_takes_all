import { buildApp } from "./server";

async function main() {
  const app = buildApp();

  try {
    await app.listen({
      host: "0.0.0.0",
      port: Number(process.env.PORT ?? 4000)
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
