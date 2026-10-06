/**
 * Base PostgreSQL locale sans Docker (PGlite = PostgreSQL compilé en WebAssembly).
 *
 *   npm run db:local      # démarre la base sur 127.0.0.1:5432
 *   npm run db:push       # crée / met à jour les tables
 *   npm run dev           # démarre l'application
 *
 * Puis dans .env :
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres
 *
 * Les données sont conservées dans .pglite-data/ (ignoré par git).
 */
import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const dataDir = process.env.PGLITE_DATA_DIR || "./.pglite-data";
const port = Number(process.env.PGLITE_PORT || 5432);
const host = process.env.PGLITE_HOST || "127.0.0.1";

mkdirSync(dataDir, { recursive: true });

const db = await PGlite.create({ dataDir });
// PGlite exécute les requêtes en série : on autorise plusieurs connexions
// (pool Next.js, drizzle-kit, scripts de test) qui seront mises en file.
const server = new PGLiteSocketServer({
  db,
  port,
  host,
  maxConnections: Number(process.env.PGLITE_MAX_CONNECTIONS || 20),
});

await server.start();

console.log(
  `[db:local] PostgreSQL local prêt : postgresql://postgres:postgres@${host}:${port}/postgres`
);
console.log(`[db:local] Données stockées dans ${dataDir}`);

const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
