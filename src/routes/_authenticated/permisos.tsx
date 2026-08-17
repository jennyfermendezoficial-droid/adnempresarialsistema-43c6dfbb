import { createFileRoute } from "@tanstack/react-router";
import { PermisosPanel } from "@/components/PermisosPanel";

export const Route = createFileRoute("/_authenticated/permisos")({
  component: () => <PermisosPanel />,
});
