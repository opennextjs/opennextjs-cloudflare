import type { IncrementalCache } from "next/dist/server/lib/incremental-cache";
import { NEXT_META_SUFFIX } from "../../constants/incremental-cache";

type PrerenderedRouteMeta = {
  lastModified: number;
  status?: number;
  headers?: Record<string, string>;
  postponed?: string;
};

type EntryKind =
  | "APP" // .body, .html - backwards compat
  | "PAGES"
  | "FETCH"
  | "APP_ROUTE" // .body
  | "APP_PAGE" // .html
  | "IMAGE"
  | undefined;

async function getAsset<T>(key: string, cb: (resp: Response) => T): Promise<Awaited<T> | undefined> {
  const resp = await process.env.ASSETS.fetch(key);
  return resp.status === 200 ? await cb(resp) : undefined;
}

export function getSeedBodyFile(key: string, suffix: string) {
  return getAsset(key + suffix, (resp) => resp.arrayBuffer() as Promise<Buffer>);
}

export function getSeedTextFile(key: string, suffix: string) {
  return getAsset(key + suffix, (resp) => resp.text());
}

export function getSeedMetaFile(key: string) {
  return getAsset(key + NEXT_META_SUFFIX, (resp) => resp.json<PrerenderedRouteMeta>());
}

export function parseCtx(ctx: Parameters<IncrementalCache["get"]>[1] = {}) {
  return { ...ctx, kind: ctx?.kindHint?.toUpperCase() } as
    | (typeof ctx & { kind?: EntryKind; isFallback?: boolean; isRoutePPREnabled?: boolean })
    | undefined;
}
