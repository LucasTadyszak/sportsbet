import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  var prismaClient: PrismaClient | undefined;
}

/**
 * Unlike a bare `pg.Client`, Prisma's driver adapter doesn't fall back to a plaintext
 * connection when `ssl` is set but the server doesn't speak TLS — it throws
 * TlsConnectionError instead. So SSL can't just be turned on unconditionally: it has
 * to match what the target actually needs. A local Postgres (Docker, or installed
 * directly) is assumed not to require it; anything else (e.g. Render's external
 * endpoint, which does) gets it.
 */
function needsSsl(host: string): boolean {
  return host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
}

/**
 * `pg` reads `sslmode`/`sslcert`/etc. straight out of the connection string and lets
 * that silently override whatever `ssl` object is passed alongside it (Prisma/CLI
 * tools need `sslmode=require` in the URL itself to reach Render, since they don't go
 * through this file at all) — so a URL carrying those params would otherwise discard
 * the explicit `rejectUnauthorized: false` below and fall back to strict certificate
 * verification, which happens to work against Render today only because its cert is
 * CA-signed, not because anything here asked for that. Stripping them keeps the app's
 * own TLS decision in `needsSsl` authoritative regardless of what the URL says.
 */
function stripSslParams(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

function createClient() {
  const rawConnectionString = process.env.DATABASE_URL;
  if (!rawConnectionString) throw new Error("DATABASE_URL is not set");

  const host = (() => {
    try {
      return new URL(rawConnectionString).hostname;
    } catch {
      return "";
    }
  })();

  const pool = new Pool({
    connectionString: stripSslParams(rawConnectionString),
    // Without this, an idle connection silently dropped by the OS/network (laptop
    // sleep, NAT/firewall timeout) or by the DB server sits in the pool looking fine
    // until a query picks it up and fails with Prisma P1017 "Server has closed the
    // connection". TCP keepalive lets the OS notice and drop it long before that.
    keepAlive: true,
    // rejectUnauthorized: false because Render's (and most managed providers') cert
    // chain isn't necessarily in Node's default trust store.
    ssl: needsSsl(host) ? { rejectUnauthorized: false } : undefined,
  });
  // Without a listener, node-postgres treats a dropped idle client's error as
  // unhandled and can crash the process; logging it here lets the pool quietly
  // discard that client and open a fresh one on the next query instead.
  pool.on("error", (err) => {
    console.error("Postgres pool error (connection dropped, will reconnect):", err.message);
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalThis.prismaClient ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaClient = prisma;
}
