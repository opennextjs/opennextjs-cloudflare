import styles from "./page.module.css";
import { getPrismaClient } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
	const prisma = await getPrismaClient();
	const allUsers = await prisma.user.findMany();

	return (
		<div className={styles.page}>
			<ul>
				{allUsers.map((user) => (
					<li key={user.id}>
						<span data-testid={`name-${user.name}`}>{user.name}</span>
						<br />
						<span data-testid={`email-${user.name}`}>{user.email}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
