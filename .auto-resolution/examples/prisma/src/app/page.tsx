import styles from "./page.module.css";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
	const db = getDb();
	const allUsers = await db.users.findMany();
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
