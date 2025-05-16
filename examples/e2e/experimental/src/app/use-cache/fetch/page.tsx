import { ISRComponent } from "@/components/cached";
import { Suspense } from "react";

async function getFromFetch() {
  "use cache";
  // This is a simple fetch to ensure that the cache is working with IO inside
  const res = await fetch("https://opennext.js.org");
  return res.headers.get("Date");
}

export default async function Page() {
  const date = await getFromFetch();
  return (
    <div>
      <h1>Cache</h1>
      <p data-testid="date">{date}</p>
      <Suspense fallback={<p>Loading...</p>}>
        <ISRComponent />
      </Suspense>
    </div>
  );
}
