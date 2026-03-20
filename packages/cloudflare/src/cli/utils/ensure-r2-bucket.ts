import { findPackagerAndRoot } from "@opennextjs/aws/build/helper.js";
import Cloudflare from "cloudflare";

import { type PackagerDetails, runWrangler } from "../commands/utils/run-wrangler.js";
import { askAccountSelection } from "./ask-account-selection.js";

/**
 * Auth credentials returned by `wrangler auth token --json`.
 *
 * Can be either:
 * - A token (OAuth or API token): `{ type: "token"; token: string }`
 * - An API key/email pair: `{ type: "api_key"; apiKey: string; apiEmail: string }`
 */
type AuthCredentials =
	| { type: "token"; token: string }
	| { type: "api_key"; apiKey: string; apiEmail: string };

/**
 * Gets the authentication credentials for Cloudflare API calls.
 *
 * Uses `wrangler auth token --json` which checks the following sources in order:
 * 1. CLOUDFLARE_API_TOKEN environment variable
 * 2. CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL environment variables
 * 3. OAuth token from `wrangler login`
 *
 * @param options The build options containing packager and monorepo root
 * @returns The auth credentials if available, undefined otherwise
 */
function getAuthCredentials(options: PackagerDetails): AuthCredentials | undefined {
	const result = runWrangler(options, ["auth", "token", "--json"], { logging: "none" });
	if (!result.success) {
		return undefined;
	}

	try {
		const json = JSON.parse(result.stdout) as
			| { type: "oauth" | "api_token"; token: string }
			| { type: "api_key"; key: string; email: string };

		if (json.type === "api_key") {
			return { type: "api_key", apiKey: json.key, apiEmail: json.email };
		}

		// Both "oauth" and "api_token" types have a token field
		if (json.token) {
			return { type: "token", token: json.token };
		}
	} catch {
		/* empty */
	}

	return undefined;
}

/**
 * Gets the account ID for Cloudflare API calls.
 *
 * Tries the following sources in order:
 * 1. CLOUDFLARE_ACCOUNT_ID or CF_ACCOUNT_ID environment variable
 * 2. List accounts using the SDK and return the first one
 *
 * @param client The Cloudflare SDK client
 * @returns The account ID if available, undefined otherwise
 */
async function getAccountId(client: Cloudflare): Promise<string | undefined> {
	if (process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID) {
		return process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
	}

	try {
		const accountsList = await client.accounts.list();
		const accounts: { id: string; name: string }[] = [];
		for await (const account of accountsList) {
			accounts.push({ id: account.id, name: account.name });
		}

		if (accounts.length === 0) {
			return undefined;
		}

		if (accounts.length === 1 && accounts[0]) {
			return accounts[0].id;
		}

		return await askAccountSelection(accounts);
	} catch {
		/* empty */
	}

	return undefined;
}

/**
 * Attempts to log in to Cloudflare via wrangler.
 *
 * @param options The build options containing packager and monorepo root
 * @returns true if login was successful, false otherwise
 */
function wranglerLogin(options: PackagerDetails): boolean {
	const result = runWrangler(options, ["login"], { logging: "all" });
	return result.success;
}

/**
 * Creates an R2 bucket if it doesn't already exist
 *
 * If no auth credentials are available, falls back to wrangler login for OAuth authentication.
 *
 * @param projectDir The project directory to detect the package manager
 * @param bucketName The name of the R2 bucket to create
 * @returns An object indicating success with the bucket name, or failure
 */
export async function ensureR2Bucket(
	projectDir: string,
	bucketName: string,
	jurisdiction?: string
): Promise<{ success: true; bucketName: string } | { success: false; error?: string }> {
	try {
		const { packager, root: monorepoRoot } = findPackagerAndRoot(projectDir);
		const options = { packager, monorepoRoot };

		let authCredentials = getAuthCredentials(options);

		// If no credentials available, fall back to wrangler login
		if (!authCredentials) {
			const loginSuccess = wranglerLogin(options);
			if (!loginSuccess) {
				return { success: false };
			}

			// Get credentials after login
			authCredentials = getAuthCredentials(options);
			if (!authCredentials) {
				return { success: false };
			}
		}

		const client =
			authCredentials.type === "api_key"
				? new Cloudflare({ apiKey: authCredentials.apiKey, apiEmail: authCredentials.apiEmail })
				: new Cloudflare({ apiToken: authCredentials.token });

		const accountId = await getAccountId(client);
		if (!accountId) {
			return { success: false };
		}

		// Check if bucket already exists
		try {
			await client.r2.buckets.get(bucketName, {
				account_id: accountId,
				// @ts-expect-error Let the API handle validation and potential errors for unsupported jurisdictions
				jurisdiction,
			});
			// Bucket exists
			return { success: true, bucketName };
		} catch (error) {
			if (!(error instanceof Cloudflare.NotFoundError)) {
				return { success: false };
			}
		}

		await client.r2.buckets.create({
			account_id: accountId,
			name: bucketName,
			// @ts-expect-error Let the API handle validation and potential errors for unsupported jurisdictions
			jurisdiction,
		});

		return { success: true, bucketName };
	} catch {
		return { success: false };
	}
}
