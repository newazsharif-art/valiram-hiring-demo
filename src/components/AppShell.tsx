"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import HomeIcon from "@mui/icons-material/Home";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import ViewListIcon from "@mui/icons-material/ViewList";
import PeopleIcon from "@mui/icons-material/People";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import TuneIcon from "@mui/icons-material/Tune";
import NotificationsIcon from "@mui/icons-material/Notifications";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import SlideshowIcon from "@mui/icons-material/Slideshow";
import CheckIcon from "@mui/icons-material/Check";
import type { Role } from "@/domain/types";
import { api } from "@/lib/api";
import { useApi, useSession } from "./SessionProvider";

const DRAWER = 256;

const NAV: { href: string; label: string; icon: React.ReactNode; roles: Role[]; badge?: boolean }[] = [
  { href: "/", label: "Home", icon: <HomeIcon />, roles: ["HR_RECRUITER", "HIRING_MANAGER", "HR_ADMIN"] },
  { href: "/tasks", label: "My tasks", icon: <AssignmentTurnedInIcon />, roles: ["HR_RECRUITER", "HIRING_MANAGER"], badge: true },
  { href: "/requisitions", label: "Requisitions", icon: <ViewListIcon />, roles: ["HR_RECRUITER", "HIRING_MANAGER", "HR_ADMIN"] },
  { href: "/candidates", label: "Candidates", icon: <PeopleIcon />, roles: ["HR_RECRUITER", "HR_ADMIN"] },
  { href: "/requisitions/new", label: "New requisition", icon: <AddCircleIcon />, roles: ["HIRING_MANAGER"] },
  { href: "/settings", label: "Settings", icon: <TuneIcon />, roles: ["HR_RECRUITER", "HR_ADMIN"] },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/requisitions") return path === "/requisitions" || (path.startsWith("/requisitions/") && !path.startsWith("/requisitions/new") && !path.endsWith("/candidates"));
  if (href === "/candidates") return path === "/candidates" || path.endsWith("/candidates");
  return path === href || path.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, personas, switchUser, showSources, setShowSources } = useSession();
  const { mode, systemMode, setMode } = useColorScheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const tasks = useApi(() => api.tasks.list("open"), [pathname], { pollMs: 5000 });
  const openCount = tasks.data?.length ?? 0;
  const effective = mode === "system" ? systemMode : mode;
  const showSourcesToggle = process.env.NEXT_PUBLIC_SHOW_SOURCES === "true";

  const nav = (
    <Box component="nav" aria-label="Main" sx={{ display: "flex", flexDirection: "column", height: "100%", p: 1 }}>
      <List sx={{ display: "flex", flexDirection: "column", gap: 0.25, p: 0 }}>
        {NAV.filter((n) => n.roles.includes(user.role)).map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <ListItemButton
              key={n.href}
              component={Link}
              href={n.href}
              selected={active}
              aria-current={active ? "page" : undefined}
              onClick={() => setMobileOpen(false)}
              sx={(theme) => ({
                borderRadius: 1,
                minHeight: 44,
                "&.Mui-selected": {
                  bgcolor: "#e3f2fd",
                  color: "#0d47a1",
                  "& .MuiListItemIcon-root": { color: "#1976d2" },
                  ...theme.applyStyles("dark", { bgcolor: "rgba(144,202,249,.16)", color: "#90caf9", "& .MuiListItemIcon-root": { color: "#90caf9" } }),
                },
              })}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{n.icon}</ListItemIcon>
              <ListItemText primary={n.label} slotProps={{ primary: { sx: { fontWeight: active ? 500 : 400 } } }} />
              {n.badge && openCount > 0 && (
                <Box component="span" sx={{ bgcolor: "#d32f2f", color: "#fff", borderRadius: 2.5, fontSize: 12, lineHeight: "20px", px: "7px" }} aria-label={`${openCount} open`}>
                  {openCount}
                </Box>
              )}
            </ListItemButton>
          );
        })}
      </List>
      <Divider sx={{ my: 1 }} />
      <ListItemButton component={Link} href="/demo" selected={pathname === "/demo"} onClick={() => setMobileOpen(false)} sx={{ borderRadius: 1, minHeight: 44 }}>
        <ListItemIcon sx={{ minWidth: 40 }}>
          <SlideshowIcon />
        </ListItemIcon>
        <ListItemText primary="Presenter panel" secondary="Demo only" />
      </ListItemButton>
      <Box sx={{ mt: "auto", px: 2, py: 1.5, borderTop: 1, borderColor: "divider", fontSize: 12, color: "text.secondary" }}>
        Opus workspace
        <br />
        <Box component="b" sx={{ color: "text.primary", fontWeight: 500 }}>
          Valiram · Recruitment
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5, color: "#b0bec5", fontWeight: 500 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#90a4ae" }} />
          Opus simulator (mock)
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <AppBar position="sticky" elevation={4}>
        <Toolbar sx={{ gap: { xs: 0.5, sm: 2 }, minHeight: 64, px: { xs: 1, sm: 2 } }}>
          <IconButton color="inherit" edge="start" aria-label="Open menu" onClick={() => setMobileOpen(true)} sx={{ display: { md: "none" } }}>
            <MenuIcon />
          </IconButton>
          <Box component={Link} href="/" sx={{ display: "flex", alignItems: "center", gap: 1.5, color: "inherit", textDecoration: "none", minWidth: 0 }}>
            <Box
              aria-hidden
              sx={(theme) => ({ width: 36, height: 36, borderRadius: "50%", bgcolor: "rgba(255,255,255,.2)", display: "grid", placeItems: "center", fontWeight: 700, flex: "none", ...theme.applyStyles("dark", { bgcolor: "#90caf9", color: "#0b1c2c" }) })}
            >
              V
            </Box>
            <Typography sx={{ fontSize: { xs: 17, sm: 20 }, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Valiram Hiring</Typography>
          </Box>
          <Box
            component="span"
            sx={{ display: { xs: "none", sm: "inline-block" }, fontSize: 12, border: "1px solid rgba(255,255,255,.5)", borderRadius: 3, px: 1.25, py: 0.25, whiteSpace: "nowrap" }}
          >
            Flow 1 · Publish JD
          </Box>
          <Box sx={{ flex: 1 }} />
          {showSourcesToggle && (
            <Button color="inherit" variant="outlined" size="small" aria-pressed={showSources} onClick={() => setShowSources(!showSources)} sx={{ display: { xs: "none", md: "inline-flex" }, borderColor: "rgba(255,255,255,.5)" }}>
              Data sources: {showSources ? "On" : "Off"}
            </Button>
          )}
          <Tooltip title={effective === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
            <IconButton color="inherit" aria-label={effective === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setMode(effective === "dark" ? "light" : "dark")}>
              {effective === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
          {user.role !== "HR_ADMIN" && (
            <IconButton color="inherit" component={Link} href="/tasks" aria-label={`Notifications, ${openCount} open tasks`}>
              <Badge badgeContent={openCount} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
          )}
          <Button
            color="inherit"
            onClick={(e) => setMenuEl(e.currentTarget)}
            aria-haspopup="menu"
            aria-expanded={!!menuEl}
            aria-label={`Signed in as ${user.name}, ${user.title}. Switch role`}
            sx={{ textTransform: "none", gap: 1.25, px: 1 }}
          >
            <Avatar sx={{ width: 36, height: 36, bgcolor: "#ffb74d", color: "#3e2700", fontSize: 15, fontWeight: 500 }}>{user.initials}</Avatar>
            <Box sx={{ display: { xs: "none", sm: "flex" }, flexDirection: "column", alignItems: "flex-start", lineHeight: 1.2 }}>
              <b>{user.name}</b>
              <Box component="small" sx={{ opacity: 0.85, fontSize: 12 }}>
                {user.title}
              </Box>
            </Box>
          </Button>
          <Menu anchorEl={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
            <ListSubheader sx={{ lineHeight: "32px" }}>Switch role (demo sign-in)</ListSubheader>
            {personas.map((p) => (
              <MenuItem
                key={p.id}
                selected={p.id === user.id}
                onClick={() => {
                  setMenuEl(null);
                  switchUser(p.id);
                  router.push("/");
                }}
              >
                <ListItemIcon>{p.id === user.id ? <CheckIcon fontSize="small" /> : null}</ListItemIcon>
                <ListItemText primary={p.name} secondary={p.title} />
              </MenuItem>
            ))}
            <Divider />
            <MenuItem component={Link} href="/demo" onClick={() => setMenuEl(null)}>
              <ListItemIcon>
                <SlideshowIcon fontSize="small" />
              </ListItemIcon>
              Presenter panel
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: "block", md: "none" }, "& .MuiDrawer-paper": { width: DRAWER, boxSizing: "border-box" } }}
        >
          {nav}
        </Drawer>
        <Box
          sx={{
            display: { xs: "none", md: "block" },
            width: DRAWER,
            flex: "none",
            bgcolor: "background.paper",
            backgroundImage: "none",
            borderRight: 1,
            borderColor: "divider",
            position: "sticky",
            top: 64,
            height: "calc(100vh - 64px)",
            overflowY: "auto",
          }}
        >
          {nav}
        </Box>
        <Box component="main" id="main" sx={{ flex: 1, minWidth: 0, p: { xs: 2, sm: 3 }, display: "flex", flexDirection: "column", gap: 3 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
