import ci from "ci-info";

/**
 * Whether the current process is running in an interactive terminal.
 */
export function isInteractive(): boolean {
	return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Whether prompts should be suppressed.
 */
export function isNonInteractiveOrCI(): boolean {
	return !isInteractive() || ci.isCI;
}
