import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, BookOpen, Radio } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { PermisosPanel } from "@/components/PermisosPanel";
import { AccesoCursosPanel } from "@/components/AccesoCursosPanel";

export const Route = createFileRoute("/_authenticated/admin")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Administración · ADN Empresarial" },
      { name: "description", content: "Permisos del equipo, acceso a cursos y acceso a clases en vivo en una sola ventana." },
      { property: "og:title", content: "Administración · ADN Empresarial" },
      { property: "og:description", content: "Permisos del equipo, acceso a cursos y acceso a clases en vivo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Tab = "permisos" | "cursos" | "clases";
const TABS: { id: Tab; label: string; icon: typeof ShieldCheck }[] = [
  { id: "permisos", label: "Permisos", icon: ShieldCheck },
  { id: "cursos", label: "Acceso a cursos", icon: BookOpen },
  { id: "clases", label: "Acceso a clases en vivo", icon: Radio },
];

function Page() {
  const { role } = useAuth();
  const [tab, setTab] = useState<Tab>("permisos");

  if (role !== "admin") {
    return <div className="p-8 text-center text-muted-foreground">Solo los administradores pueden ver esta sección.</div>;
  }

  return (
    <div>
      <div className="px-4 md:px-6 pt-4 max-w-7xl mx-auto">
        <div className="flex flex-wrap gap-1 p-1 rounded-xl border bg-card w-fit">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition inline-flex items-center gap-1.5 ${tab === t.id ? "bg-violet-gradient text-white" : "text-muted-foreground hover:text-foreground"}`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "permisos" && <PermisosPanel />}
      {tab === "cursos" && <AccesoCursosPanel tipo="curso" titulo="Acceso a cursos" plural="los cursos" />}
      {tab === "clases" && <AccesoCursosPanel tipo="clase_en_vivo" titulo="Acceso a clases en vivo" plural="las clases en vivo" />}
    </div>
  );
}
