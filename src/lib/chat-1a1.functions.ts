import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const abrirSchema = z.object({
  other_id: z.string().uuid(),
});

const mensajeSchema = z.object({
  chat_id: z.string().uuid(),
  tipo: z.enum(["texto", "imagen", "video", "audio", "archivo"]),
  contenido: z.string().max(10000).nullable().optional(),
  media_url: z.string().max(3000).nullable().optional(),
});

async function buscarChat(userId: string, otherId: string) {
  const { data: directo, error: directoError } = await supabaseAdmin
    .from("chats_1a1")
    .select("id,usuario_a_id,usuario_b_id,last_message_at")
    .eq("usuario_a_id", userId)
    .eq("usuario_b_id", otherId)
    .maybeSingle();
  if (directoError) throw new Error(directoError.message);
  if (directo) return directo;

  if (userId === otherId) return null;

  const { data: inverso, error: inversoError } = await supabaseAdmin
    .from("chats_1a1")
    .select("id,usuario_a_id,usuario_b_id,last_message_at")
    .eq("usuario_a_id", otherId)
    .eq("usuario_b_id", userId)
    .maybeSingle();
  if (inversoError) throw new Error(inversoError.message);
  return inverso ?? null;
}

export const asegurarChat1a1 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => abrirSchema.parse(data))
  .handler(async ({ data, context }) => {
    const existente = await buscarChat(context.userId, data.other_id);
    if (existente) return existente;

    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", data.other_id)
      .maybeSingle();
    if (perfilError) throw new Error(perfilError.message);
    if (!perfil) throw new Error("El miembro seleccionado ya no está disponible.");

    // Orden canónico para que dos usuarios que abren el mismo chat al mismo
    // tiempo apunten al mismo par, incluso si cada uno inicia desde su lado.
    const [usuarioA, usuarioB] = [context.userId, data.other_id].sort();
    const { data: creado, error: crearError } = await supabaseAdmin
      .from("chats_1a1")
      .insert({ usuario_a_id: usuarioA, usuario_b_id: usuarioB })
      .select("id,usuario_a_id,usuario_b_id,last_message_at")
      .single();

    if (!crearError && creado) return creado;

    const duplicado = (crearError as { code?: string } | null)?.code === "23505"
      || crearError?.message?.toLowerCase().includes("duplicate key");
    if (duplicado) {
      const recuperado = await buscarChat(context.userId, data.other_id);
      if (recuperado) return recuperado;
    }

    throw new Error(crearError?.message || "No se pudo abrir el chat.");
  });

export const enviarMensajeChat1a1 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => mensajeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: chat, error: chatError } = await supabaseAdmin
      .from("chats_1a1")
      .select("id,usuario_a_id,usuario_b_id")
      .eq("id", data.chat_id)
      .maybeSingle();
    if (chatError) throw new Error(chatError.message);
    if (!chat) throw new Error("El chat ya no existe.");
    if (chat.usuario_a_id !== context.userId && chat.usuario_b_id !== context.userId) {
      throw new Error("No perteneces a este chat.");
    }

    const contenido = data.contenido?.trim() || null;
    const mediaUrl = data.media_url?.trim() || null;
    if (data.tipo === "texto" && !contenido) throw new Error("Escribe un mensaje.");
    if (data.tipo !== "texto" && !mediaUrl) throw new Error("No se encontró el archivo para enviar.");

    const { data: mensaje, error } = await supabaseAdmin
      .from("mensajes_chat_1a1")
      .insert({
        chat_id: data.chat_id,
        autor_id: context.userId,
        tipo: data.tipo,
        contenido,
        media_url: mediaUrl,
      })
      .select("id")
      .single();
    if (error || !mensaje) throw new Error(error?.message || "No se pudo enviar el mensaje.");

    await supabaseAdmin
      .from("chats_1a1")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", data.chat_id);

    return { id: mensaje.id };
  });
