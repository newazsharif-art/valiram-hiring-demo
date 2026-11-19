"use client";
import { createTheme } from "@mui/material/styles";
import type { ChipTone } from "@/lib/format";

/** Status chip colours from the mockup (light / theme-dark.css). */
export const CHIP_COLORS: Record<ChipTone, { light: [string, string]; dark: [string, string] }> = {
  live: { light: ["#e8f5e9", "#1b5e20"], dark: ["rgba(102,187,106,.16)", "#a5d6a7"] },
  hr: { light: ["#fff3e0", "#8a4500"], dark: ["rgba(255,167,38,.16)", "#ffcc80"] },
  ret: { light: ["#fce4ec", "#880e4f"], dark: ["rgba(240,98,146,.16)", "#f8bbd0"] },
  esc: { light: ["#ffebee", "#b71c1c"], dark: ["rgba(244,67,54,.18)", "#ef9a9a"] },
  ai: { light: ["#e3f2fd", "#0d47a1"], dark: ["rgba(144,202,249,.16)", "#bbdefb"] },
  draft: { light: ["#eceff1", "#37474f"], dark: ["rgba(176,190,197,.16)", "#cfd8dc"] },
  post: { light: ["#ede7f6", "#4527a0"], dark: ["rgba(179,157,219,.16)", "#d1c4e9"] },
};

const FONT = 'Roboto, system-ui, -apple-system, "Segoe UI", sans-serif';

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  defaultColorScheme: "dark",
  colorSchemes: {
    dark: {
      palette: {
        primary: { main: "#90caf9", dark: "#64b5f6", contrastText: "#0b1c2c" },
        background: { default: "#121212", paper: "#1e1e1e" },
        text: { primary: "rgba(255,255,255,.87)", secondary: "rgba(255,255,255,.7)" },
        success: { main: "#66bb6a" },
        warning: { main: "#ffa726" },
        error: { main: "#ef5350" },
        info: { main: "#29b6f6" },
        divider: "rgba(255,255,255,.12)",
      },
    },
    light: {
      palette: {
        primary: { main: "#1976d2", dark: "#1565c0" },
        background: { default: "#f5f5f5", paper: "#ffffff" },
        text: { primary: "rgba(0,0,0,.87)", secondary: "rgba(0,0,0,.6)" },
      },
    },
  },
  typography: {
    fontFamily: FONT,
    h1: { fontSize: 28, fontWeight: 400, lineHeight: 1.25 },
    h2: { fontSize: 18, fontWeight: 500 },
    h3: { fontSize: 16, fontWeight: 500 },
    body2: { fontSize: 14 },
  },
  shape: { borderRadius: 4 },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: "#1976d2",
          color: "#fff",
          ...theme.applyStyles("dark", { backgroundColor: "#272727", backgroundImage: "none" }),
        }),
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 40, letterSpacing: ".03em" } },
    },
    MuiCard: { defaultProps: { elevation: 1 } },
    MuiTableCell: { styleOverrides: { head: ({ theme }) => ({ color: theme.vars.palette.text.secondary, fontWeight: 500, whiteSpace: "nowrap" }) } },
    MuiTab: { styleOverrides: { root: { textTransform: "none", fontWeight: 500, fontSize: 14 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
  },
});
