import type { PrismaConfig } from "prisma";

export default {
  earlyAccess: true,
  schema: "./schema.prisma",
} satisfies PrismaConfig;
