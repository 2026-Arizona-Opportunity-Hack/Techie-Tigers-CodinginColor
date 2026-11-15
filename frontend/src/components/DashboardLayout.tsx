
import { useState } from "react";
import {
  Navigate,
  Outlet,
  useLocation,
  useParams,
} from "react-router-dom";
import { Menu, X, Bell, CircleUserRound } from "lucide-react";
import Sidebar from "./Sidebar";
import {
  roleMenus,
  roleNames,
  type Role,
} from "../lib/roles";

export default function DashboardLayout() {
  const { role } = useParams();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (
    role !== "admin" &&
    role !== "board" &&
    role !== "fundraising"
  ) {
    return <Navigate to="/login" replace />;
  }

  const currentRole: Role = role;

  const section = location.pathname.split("/")[2] || "overview";

  const currentPage = roleMenus[currentRole].find(
    (item) => item.path === section
  );

  const pageTitle = currentPage?.label || "Dashboard";

  return (
    <div className="min-h-screen bg-[#F5F0E6] font-body text-[#242A26]">
      {/* Desktop Sidebar */}
      <div className="fixed inset-y-0 left-0 hidden w-64 lg:block">
        <Sidebar role={currentRole} />
      </div>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/40"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />

          <div className="absolute inset-y-0 left-0 w-64">
            <Sidebar
              role={currentRole}
              onNavigate={() => setMobileOpen(false)}
            />

            <button
              className="absolute right-4 top-6 text-white"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Main Area */}
      <div className="min-h-screen lg:ml-64">
        {/* Header */}
        <header className="flex h-20 items-center justify-between border-b border-[#D8DED4] bg-[#F5F0E6] px-6 sm:px-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileOpen(true)}
              className="text-[#183E32] lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={24} />
            </button>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#5E6B61]">
                {roleNames[currentRole]}
              </p>

              <h1 className="font-display text-3xl leading-tight">
                {pageTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-5 text-[#52665B]">
            <Bell size={19} aria-label="Notifications" />

            <div className="hidden h-8 w-px bg-[#D8DED4] sm:block" />

            <CircleUserRound size={27} aria-label="User profile" />
          </div>
        </header>

        {/* Changing Page Content */}
        <main className="mx-auto max-w-[1500px] px-6 py-8 sm:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
