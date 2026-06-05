import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "./connection.js";
import { repairLegacy0003State } from "./legacy-migration-repair.js";
import { ensureSchemaHealth } from "./schema-health.js";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

export function runMigrations(): void {
  try {
    if (!fs.existsSync(migrationsFolder)) {
      throw new Error(`Migrations folder not found: ${migrationsFolder}`);
    }

    console.info("[DB] Running migrations", {
      dbPath: sqlite.name,
      migrationsFolder,
    });

    const legacyRepairs = repairLegacy0003State(sqlite, migrationsFolder);
    if (legacyRepairs.length > 0) {
      console.warn("[DB] Applied pre-migration legacy repairs", { repairs: legacyRepairs });
    }

    migrate(db, { migrationsFolder });

    const schemaHealth = ensureSchemaHealth(sqlite);
    if (schemaHealth.repaired.length > 0) {
      console.warn("[DB] Applied schema repairs", { repairs: schemaHealth.repaired });
    }

    console.info("[DB] Migration + schema health checks complete");
  } catch (e) {
    console.error("[DB] Migration/schema health failed. Have you run `npm run db:generate`?", e);
    process.exit(1);
  }
}
