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
function needsSsl(connectionString: string | undefined): boolean {
  if (!connectionString) return false;
  try {
    const host = new URL(connectionString).hostname;
    return host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
  } catch {
    return false;
  }
}

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({
    connectionString,
    // Without this, an idle connection silently dropped by the OS/network (laptop
    // sleep, NAT/firewall timeout) or by the DB server sits in the pool looking fine
    // until a query picks it up and fails with Prisma P1017 "Server has closed the
    // connection". TCP keepalive lets the OS notice and drop it long before that.
    keepAlive: true,
    // rejectUnauthorized: false because Render's (and most managed providers') cert
    // chain isn't in Node's default trust store.
    ssl: needsSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
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
