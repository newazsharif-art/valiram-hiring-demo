"use client";
import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "@/theme/theme";
import { SessionProvider } from "./SessionProvider";
import { AppShell } from "./AppShell";

export function Providers({ initialUserId, children }: { initialUserId: string; children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme} defaultMode="dark">
      <CssBaseline enableColorScheme />
      <SessionProvider initialUserId={initialUserId}>
        <AppShell>{children}</AppShell>
      </SessionProvider>
    </ThemeProvider>
  );
}
