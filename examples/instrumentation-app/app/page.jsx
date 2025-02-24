import Link from "next/link";

export default function () {
  return (
    <div>
      <p>
        See{" "}
        <Link href="/api/hello">
          <code>/api/hello</code>
        </Link>
      </p>
      <p>
        See{" "}
        <Link href="/middleware">
          <code>/middleware</code>
        </Link>
      </p>
    </div>
  );
}
