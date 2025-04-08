import type { Metadata } from "next";
import "./globals.css";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export const metadata: Metadata = {
  title: "SSG App",
  description: "An app in which all the routes are SSG'd",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cloudflareContext = await getCloudflareContext({
    async: true,
  });

  return (
    <html lang="en">
      <body>
        {children}
        <footer data-testid="app-version">{cloudflareContext.env.APP_VERSION}</footer>
      </body>
    </html>
  );
}
