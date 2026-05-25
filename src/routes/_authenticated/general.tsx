import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/general")({ component: Page });

function Page() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-semibold mb-2" style={{ fontFamily: "var(--font-display)" }}>Canal general</h1>
      <p className="text-sm text-muted-foreground">Chat de comunidad — próximamente (texto, audio, imágenes y vídeo).</p>
    </div>
  );
}