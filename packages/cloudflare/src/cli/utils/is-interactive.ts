/**
 * Whether the current process is running in an interactive terminal.
 */
export function isInteractive(): boolean {
	return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
