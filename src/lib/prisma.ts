import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  var prismaClient: PrismaClient | undefined;
}

function createClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Without this, an idle connection silently dropped by the OS/network (laptop
    // sleep, NAT/firewall timeout) or by the DB server sits in the pool looking fine
    // until a query picks it up and fails with Prisma P1017 "Server has closed the
    // connection". TCP keepalive lets the OS notice and drop it long before that.
    keepAlive: true,
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
