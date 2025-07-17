import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	try {
		await res.revalidate("/ssg/");
		return res.json({ hello: "OpenNext rocks!" });
	} catch (e) {
		console.error(e);
		return res.status(500).json({ error: "An error occurred" });
	}
}
