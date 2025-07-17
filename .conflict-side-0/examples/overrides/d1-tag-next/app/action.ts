"use server";

import { revalidatePath, revalidateTag } from "next/cache";

export async function revalidateTagAction() {
	revalidateTag("date");
}

export async function revalidatePathAction() {
	revalidatePath("/");
}
