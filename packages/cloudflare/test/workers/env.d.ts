import type { DOShardedTagCache } from "../../src/api/durable-objects/sharded-tag-cache.js";

declare global {
	namespace Cloudflare {
		interface Env {
			TAG_CACHE: DurableObjectNamespace<DOShardedTagCache>;
		}
	}
}
