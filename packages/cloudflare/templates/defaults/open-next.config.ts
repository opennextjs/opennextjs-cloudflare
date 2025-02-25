// default open-next.config.ts file created by @opennextjs/cloudflare
import { defineConfig } from "@opennextjs/cloudflare/dist/api/config";
import cache from "@opennextjs/cloudflare/dist/api/kv-cache";

export default defineConfig({
  incrementalCache: cache,
});
