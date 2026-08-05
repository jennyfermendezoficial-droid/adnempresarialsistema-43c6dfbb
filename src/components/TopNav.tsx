import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, LogOut, User } from "lucide-react";
import { useRef, useState } from "react";
import { Logo, BrandName } from "./Logo";
import { useAuth } from "@/lib/auth-context";
import { InstallAppButton } from "./InstallAppButton";
import { GeneralChatPopover } from "./GeneralChatPopover";
import { NotificationsPopover } from "./NotificationsPopover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  inicioItems, soporteItems, academiaItems, comunidadItems, adminItems,
  type NavItem,
} from "@/lib/nav-items";

const BAR = "var(--deep-2)";

function HoverGroup({
  label,
  items,
  active,
  isActive,
}: {
  label: string;
  items: NavItem[];
  active: boolean;
  isActive: (p: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        onMouseEnter={show}
        onMouseLeave={hide}
        className="flex items-center gap-1.5 px-3 py-2.5 text-[14px] whitespace-nowrap border-b-2 transition-colors outline-none"
        style={
          active
            ? { color: "#fff", borderColor: "var(--violet)" }
            : { color: "var(--violet-light)", borderColor: "transparent" }
        }
      >
        {label}
        <ChevronDown className="w-3.5 h-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        sideOffset={0}
        onMouseEnter={show}
        onMouseLeave={hide}
        className="w-60"
      >
        {items.map(({ to, label: l, icon: Icon }) => (
          <DropdownMenuItem key={to} asChild>
            <Link
              to={to}
              className="flex items-center gap-2 cursor-pointer"
              data-active={isActive(to) ? "true" : undefined}
            >
              <Icon className="w-4 h-4" /> {l}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopNav() {
  const { profile, role, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");

  const flat: NavItem[] = [...inicioItems, ...soporteItems, ...comunidadItems];
  const groups: { label: string; items: NavItem[] }[] = [
    { label: "Academia", items: academiaItems },
    ...(role === "admin" || role === "soporte"
      ? [{ label: "Admin", items: adminItems }]
      : []),
  ];

  const initial = (profile?.nombre_completo || profile?.email || "?").slice(0, 1).toUpperCase();

  return (
    <header
      className="sticky top-0 z-40 w-full border-b"
      style={{ background: BAR, color: "var(--violet-light)", borderColor: "var(--line-dark)" }}
    >
      <div className="relative">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(circle at top right, rgba(124,107,255,.15), transparent 60%)" }}
        />
        <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6">
          {/* Fila 1 */}
          <div className="h-14 flex items-center gap-4">
            <Link to="/inicio" className="flex items-center gap-3 min-w-0">
              <Logo size={30} />
              <BrandName className="text-[15px] truncate" />
            </Link>

            <div className="ml-auto flex items-center gap-2 shrink-0">
              <GeneralChatPopover />
              <NotificationsPopover />
              <InstallAppButton variant="icon" />

              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-white/10 transition-colors outline-none">
                  <div
                    className="w-8 h-8 rounded-full grid place-items-center text-white text-sm font-semibold"
                    style={{ background: "linear-gradient(135deg,var(--violet),var(--violet-2))" }}
                  >
                    {initial}
                  </div>
                  <ChevronDown className="w-4 h-4 opacity-70" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <div className="text-sm font-semibold truncate">{profile?.nombre_completo || "Mi cuenta"}</div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">
                      {role || "usuario"}
                    </div>
                  </div>
                  <DropdownMenuItem asChild>
                    <Link to="/perfil" className="flex items-center gap-2 cursor-pointer">
                      <User className="w-4 h-4" /> Mi perfil
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => signOut()} className="flex items-center gap-2 cursor-pointer">
                    <LogOut className="w-4 h-4" /> Cerrar sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Fila 2: pestañas */}
          <nav className="flex items-stretch justify-center gap-1 overflow-x-auto">
            {flat.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="group flex items-center gap-2 px-3 py-2.5 text-[14px] whitespace-nowrap border-b-2 transition-colors"
                style={
                  isActive(to)
                    ? { color: "#fff", borderColor: "var(--violet)" }
                    : { color: "var(--violet-light)", borderColor: "transparent" }
                }
              >
                <Icon className="w-[17px] h-[17px] shrink-0 opacity-80" />
                <span>{label}</span>
              </Link>
            ))}

            {groups.map((g) => {
              const active = g.items.some((i) => isActive(i.to));
              return (
                <HoverGroup
                  key={g.label}
                  label={g.label}
                  items={g.items}
                  active={active}
                  isActive={isActive}
                />
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
