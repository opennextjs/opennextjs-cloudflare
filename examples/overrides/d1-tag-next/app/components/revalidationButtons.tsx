"use client";

import { revalidateTagAction, revalidatePathAction } from "../action";

export default function RevalidationButtons() {
  return (
    <div>
      <button
        data-testid="revalidate-tag"
        onClick={async () => {
          await revalidateTagAction();
        }}
      >
        Invalidate tag
      </button>

      <button
        data-testid="revalidate-path"
        onClick={async () => {
          await revalidatePathAction();
        }}
      >
        Invalidate Path
      </button>
    </div>
  );
}
