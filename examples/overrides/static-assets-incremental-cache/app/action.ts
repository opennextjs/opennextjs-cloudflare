"use server";

import { revalidatePath, revalidateTag } from "next/cache";

export async function revalidateTagAction() {
	revalidateTag("date", "max");
}

export async function revalidatePathAction() {
	revalidatePath("/");
}
