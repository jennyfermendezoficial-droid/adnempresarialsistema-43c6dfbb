import { supabase } from "@/integrations/supabase/client";

export interface PerfilPublico {
  id: string;
  nombre_completo: string | null;
  avatar_url?: string | null;
  actividad?: string | null;
  email?: string | null;
}

type RpcFn = (fn: string, args?: Record<string, unknown>) => Promise<{ data: PerfilPublico[] | null }>;

/** Datos públicos (nombre, foto, actividad) de personas. Sin correos ni tarifas. */
export async function fetchPerfiles(ids?: string[]): Promise<PerfilPublico[]> {
  const rpc = (supabase.rpc as unknown as RpcFn).bind(supabase) as RpcFn;
  const args = ids ? { _ids: Array.from(new Set(ids.filter(Boolean))) } : {};
  if (ids && !(args as { _ids: string[] })._ids.length) return [];
  const { data } = await rpc("perfiles_publicos", args);
  return data ?? [];
}

export async function fetchPerfilesMap(ids?: string[]): Promise<Record<string, PerfilPublico>> {
  const list = await fetchPerfiles(ids);
  const map: Record<string, PerfilPublico> = {};
  list.forEach((p) => { map[p.id] = p; });
  return map;
}