const chunkLoaders = [
	() => import("./chunks/chunk-00"),
	() => import("./chunks/chunk-01"),
	() => import("./chunks/chunk-02"),
	() => import("./chunks/chunk-03"),
	() => import("./chunks/chunk-04"),
	() => import("./chunks/chunk-05"),
	() => import("./chunks/chunk-06"),
	() => import("./chunks/chunk-07"),
	() => import("./chunks/chunk-08"),
	() => import("./chunks/chunk-09"),
	() => import("./chunks/chunk-10"),
	() => import("./chunks/chunk-11"),
] as const;

/** Keep imports genuinely lazy so a cold isolate must exercise Next's module-loading signal. */
export async function loadHostileChunk(index: number) {
	return chunkLoaders[index % chunkLoaders.length]!();
}
