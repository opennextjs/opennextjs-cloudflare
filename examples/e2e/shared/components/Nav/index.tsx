"use client";
import Link from "next/link";
import type { PropsWithChildren } from "react";

type Props = PropsWithChildren & {
  href: string;
  title: string;
  icon?: string;
  prefetch?: boolean;
};
export default function Nav(p: Props) {
  const { children, href, title, icon = "/static/frank.webp", prefetch } = p;
  return (
    <Link
      href={href}
      className="flex flex-col group border p-2 rounded-sm border-orange-500"
      prefetch={prefetch}
    >
      <div className="flex items-center relative">
        <div>{title}</div>
        <div>
          <img
            width={32}
            className="absolute -top-2 group-hover:rotate-12 group-hover:ml-10 group-hover:scale-125 transition-all"
            src={icon}
          />
        </div>
      </div>
      <div>{children}</div>
    </Link>
  );
}
