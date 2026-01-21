"use server";

import { revalidatePath, revalidateTag } from "next/cache";

export async function revalidateTagAction() {
	revalidateTag("date", { expire: 0 });
}

export async function revalidatePathAction() {
	revalidatePath("/");
}
