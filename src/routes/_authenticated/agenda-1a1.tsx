import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/agenda-1a1")({ component: Page });

function Page() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-semibold mb-2" style={{ fontFamily: "var(--font-display)" }}>Agenda 1a1</h1>
      <p className="text-sm text-muted-foreground">Próximamente.</p>
    </div>
  );
}
