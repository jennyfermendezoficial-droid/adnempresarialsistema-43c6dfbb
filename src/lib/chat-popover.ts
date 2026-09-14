type AbridorChat = (userId: string) => void;

let abridor: AbridorChat | null = null;
let pendiente: string | null = null;

export function registrarAbridorChat(fn: AbridorChat) {
  abridor = fn;
  if (pendiente) {
    const userId = pendiente;
    pendiente = null;
    queueMicrotask(() => fn(userId));
  }

  return () => {
    if (abridor === fn) abridor = null;
  };
}

export function abrirChatSuperior(userId: string) {
  if (!userId) return;
  if (abridor) {
    abridor(userId);
    return;
  }
  pendiente = userId;
}
