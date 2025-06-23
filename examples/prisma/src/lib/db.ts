import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const getDb = () => {
	const { env } = getCloudflareContext();
	const adapter = new PrismaD1(env.DB);
	return new PrismaClient({
		adapter,
	});
};
