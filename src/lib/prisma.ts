import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
  var prismaClient: PrismaClient | undefined;
}

function createClient() {
  const connectionString = process.env.DATABASE_URL ?? "";
  // Render (and most managed Postgres hosts) require TLS on external connections and
  // just close the socket on a plain one, rather than refusing it up front. A local
  // dev database has no TLS listener at all, so only force it for non-local hosts.
  const isLocal = /^postgres(ql)?:\/\/[^/]*@?(localhost|127\.0\.0\.1)/.test(connectionString);
  const adapter = new PrismaPg({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalThis.prismaClient ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaClient = prisma;
}
