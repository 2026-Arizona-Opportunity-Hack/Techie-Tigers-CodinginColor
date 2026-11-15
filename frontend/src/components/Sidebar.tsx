
import { NavLink, useNavigate } from "react-router-dom";
import { LogOut, Asterisk } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { roleMenus, roleNames, type Role } from "../lib/roles";

interface SidebarProps {
  role: Role;
  onNavigate?: () => void;
}

export default function Sidebar({
  role,
  onNavigate,
}: SidebarProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  return (
    <aside className="flex h-full min-h-screen w-64 flex-col bg-[#183E32] text-[#F5F0E6]">
      {/* Branding */}
      <div className="border-b border-[#416354] px-6 py-7">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center border border-[#88A596]">
            <Asterisk size={24} strokeWidth={1.5} />
          </div>

          <span className="text-lg font-semibold tracking-[-0.05em]">
            coding in color.
          </span>
        </div>

        <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#AEC4B5]">
          {roleNames[role]} Workspace
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-6">
        {roleMenus[role].map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={`/${role}/${item.path}`}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                  isActive
                    ? "bg-[#315747] font-semibold text-white"
                    : "text-[#C6D7CC] hover:bg-[#254C3E] hover:text-white"
                }`
              }
            >
              <Icon size={18} strokeWidth={1.7} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-[#416354] p-4">
        <button
          onClick={async () => {
            onNavigate?.();
            await signOut();
            navigate("/login");
          }}
          className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-sm text-[#C6D7CC] hover:bg-[#254C3E] hover:text-white"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
