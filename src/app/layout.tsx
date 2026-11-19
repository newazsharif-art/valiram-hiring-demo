import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "@fontsource/roboto-mono/500.css";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Valiram Hiring",
  description: "Valiram × Opus recruitment demo: Flow 1 (Publish JD) and Flow 1b (Shortlist)",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const c = await cookies();
  const userId = c.get("vh_user")?.value ?? "siti";
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <InitColorSchemeScript attribute="class" defaultMode="dark" />
        <AppRouterCacheProvider>
          <Providers initialUserId={userId}>{children}</Providers>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
