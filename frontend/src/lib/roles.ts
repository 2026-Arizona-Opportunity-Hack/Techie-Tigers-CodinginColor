// Roles, their sidebar menus and display names. Kept out of Sidebar.tsx so
// that file only exports a component (needed for Vite's fast refresh).
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Mail,
  ChartNoAxesCombined,
  Upload,
  UserCog,
  KeyRound,
  CopyCheck,
} from "lucide-react";

export type Role = "admin" | "board" | "fundraising";

export const roleMenus = {
  admin: [
    { label: "Overview", path: "overview", icon: LayoutDashboard },
    { label: "All Donors", path: "donors", icon: Users },
    { label: "Retention", path: "retention", icon: ChartNoAxesCombined },
    { label: "Outreach", path: "outreach", icon: Mail },
    { label: "CSV Imports", path: "imports", icon: Upload },
    { label: "Duplicate Review", path: "duplicates", icon: CopyCheck },
    { label: "Board Members", path: "members", icon: UserCog },
    { label: "API Keys", path: "api-keys", icon: KeyRound },
  ],

  board: [
    { label: "My Dashboard", path: "overview", icon: LayoutDashboard },
    { label: "My Donors", path: "donors", icon: Users },
    { label: "Follow-ups", path: "followups", icon: CalendarCheck },
    { label: "Retention", path: "retention", icon: ChartNoAxesCombined },
    { label: "Outreach", path: "outreach", icon: Mail },
  ],

  fundraising: [
    { label: "Overview", path: "overview", icon: LayoutDashboard },
    { label: "All Donors", path: "donors", icon: Users },
    { label: "Retention", path: "retention", icon: ChartNoAxesCombined },
    { label: "Board Members", path: "members", icon: UserCog },
  ],
};

export const roleNames: Record<Role, string> = {
  admin: "CEO / Admin",
  board: "Board Member",
  fundraising: "Fundraising",
};
