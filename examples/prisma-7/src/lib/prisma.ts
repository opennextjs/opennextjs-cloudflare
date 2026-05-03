import { PrismaClient } from "../generated/prisma/client";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaD1 } from "@prisma/adapter-d1";
import { cache } from "react";

const getPrismaClient = cache(async () => {
	const { env } = await getCloudflareContext({ async: true });
	const adapter = new PrismaD1(env.DB);
	return new PrismaClient({ adapter });
});
export { getPrismaClient };
