import { randomUUID } from "node:crypto";

import Enquirer from "enquirer";

interface Account {
	id: string;
	name: string;
}

/**
 * Prompts the user to select a Cloudflare account from a list via an interactive CLI prompt.
 *
 * @param accounts - The list of Cloudflare accounts to choose from.
 * @returns The ID of the selected account, or `undefined` if no selection was made.
 */
export async function askAccountSelection(accounts: Account[]): Promise<string | undefined> {
	const questionName = randomUUID();

	const enquirerAnswersObject = await Enquirer.prompt<Record<string, string>>({
		name: questionName,
		message: "Select which Cloudflare account to use",
		type: "select",
		choices: accounts.map((account) => ({
			name: account.id,
			message: account.name,
		})),
		format: (accountId) => `${accounts.find(({ id }) => id === accountId)?.name ?? ""}`,
	});

	console.log("");

	return enquirerAnswersObject[questionName];
}
