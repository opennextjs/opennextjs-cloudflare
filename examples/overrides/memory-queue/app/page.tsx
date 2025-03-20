import styles from "./page.module.css";

export const revalidate = 5;

export default async function Home() {
  // We purposefully wait for 2 seconds to allow deduplication to occur
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Hello from a Statically generated page</h1>
        <p data-testid="date-local">{Date.now()}</p>
      </main>
    </div>
  );
}
