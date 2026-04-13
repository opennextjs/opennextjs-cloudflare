/**
 * Whether the current process is running in an interactive terminal.
 *
 * Used to gate prompts that would otherwise hang or error in non-TTY
 * environments like CI, Docker builds, or Cloudflare Workers Builds.
 *
 * Matches the same check wrangler uses for its own interactive detection.
 */
export function isInteractive(): boolean {
	return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
