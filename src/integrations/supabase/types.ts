export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ae_actividades: {
        Row: {
          categoria_id: string | null
          color: string | null
          created_at: string
          descripcion: string | null
          duracion_min: number
          fecha: string
          hora_inicio: string
          id: string
          link: string | null
          recordatorios: Json | null
          recurrencia: string | null
          titulo: string
          ubicacion: string | null
          usuario_id: string
        }
        Insert: {
          categoria_id?: string | null
          color?: string | null
          created_at?: string
          descripcion?: string | null
          duracion_min?: number
          fecha: string
          hora_inicio: string
          id?: string
          link?: string | null
          recordatorios?: Json | null
          recurrencia?: string | null
          titulo: string
          ubicacion?: string | null
          usuario_id: string
        }
        Update: {
          categoria_id?: string | null
          color?: string | null
          created_at?: string
          descripcion?: string | null
          duracion_min?: number
          fecha?: string
          hora_inicio?: string
          id?: string
          link?: string | null
          recordatorios?: Json | null
          recurrencia?: string | null
          titulo?: string
          ubicacion?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ae_actividades_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "ae_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      ae_cat_gastos: {
        Row: {
          ambito: string
          color: string
          created_at: string
          icono: string | null
          id: string
          nombre: string
          orden: number
          tipo: string
          usuario_id: string
        }
        Insert: {
          ambito: string
          color?: string
          created_at?: string
          icono?: string | null
          id?: string
          nombre: string
          orden?: number
          tipo?: string
          usuario_id: string
        }
        Update: {
          ambito?: string
          color?: string
          created_at?: string
          icono?: string | null
          id?: string
          nombre?: string
          orden?: number
          tipo?: string
          usuario_id?: string
        }
        Relationships: []
      }
      ae_categorias: {
        Row: {
          color: string
          created_at: string
          icono: string | null
          id: string
          nombre: string
          usuario_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          icono?: string | null
          id?: string
          nombre: string
          usuario_id: string
        }
        Update: {
          color?: string
          created_at?: string
          icono?: string | null
          id?: string
          nombre?: string
          usuario_id?: string
        }
        Relationships: []
      }
      ae_cuotas: {
        Row: {
          estado: string
          fecha_pago: string | null
          fecha_programada: string
          id: string
          modificada: boolean
          numero: number
          observacion: string | null
          prestamo_id: string
          usuario_id: string
          valor: number
        }
        Insert: {
          estado?: string
          fecha_pago?: string | null
          fecha_programada: string
          id?: string
          modificada?: boolean
          numero: number
          observacion?: string | null
          prestamo_id: string
          usuario_id: string
          valor: number
        }
        Update: {
          estado?: string
          fecha_pago?: string | null
          fecha_programada?: string
          id?: string
          modificada?: boolean
          numero?: number
          observacion?: string | null
          prestamo_id?: string
          usuario_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "ae_cuotas_prestamo_id_fkey"
            columns: ["prestamo_id"]
            isOneToOne: false
            referencedRelation: "ae_prestamos"
            referencedColumns: ["id"]
          },
        ]
      }
      ae_items_cat: {
        Row: {
          categoria_id: string
          created_at: string
          cuenta_pago: string | null
          descripcion: string | null
          fecha: string
          id: string
          nombre: string
          recurrencia: string
          usuario_id: string
          valor: number
        }
        Insert: {
          categoria_id: string
          created_at?: string
          cuenta_pago?: string | null
          descripcion?: string | null
          fecha?: string
          id?: string
          nombre: string
          recurrencia?: string
          usuario_id: string
          valor: number
        }
        Update: {
          categoria_id?: string
          created_at?: string
          cuenta_pago?: string | null
          descripcion?: string | null
          fecha?: string
          id?: string
          nombre?: string
          recurrencia?: string
          usuario_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "ae_items_cat_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "ae_cat_gastos"
            referencedColumns: ["id"]
          },
        ]
      }
      ae_movimientos: {
        Row: {
          ambito: string
          categoria: string | null
          created_at: string
          descripcion: string | null
          fecha: string
          id: string
          monto: number
          tipo: string
          usuario_id: string
        }
        Insert: {
          ambito: string
          categoria?: string | null
          created_at?: string
          descripcion?: string | null
          fecha?: string
          id?: string
          monto: number
          tipo: string
          usuario_id: string
        }
        Update: {
          ambito?: string
          categoria?: string | null
          created_at?: string
          descripcion?: string | null
          fecha?: string
          id?: string
          monto?: number
          tipo?: string
          usuario_id?: string
        }
        Relationships: []
      }
      ae_prestamos: {
        Row: {
          ambito: string
          categoria_id: string | null
          created_at: string
          deuda_total: number
          fecha_primera_cuota: string
          id: string
          motivo: string | null
          nombre: string
          num_cuotas: number
          observaciones: string | null
          tipo: string
          usuario_id: string
          valor_cuota: number
        }
        Insert: {
          ambito: string
          categoria_id?: string | null
          created_at?: string
          deuda_total: number
          fecha_primera_cuota: string
          id?: string
          motivo?: string | null
          nombre: string
          num_cuotas: number
          observaciones?: string | null
          tipo?: string
          usuario_id: string
          valor_cuota: number
        }
        Update: {
          ambito?: string
          categoria_id?: string | null
          created_at?: string
          deuda_total?: number
          fecha_primera_cuota?: string
          id?: string
          motivo?: string | null
          nombre?: string
          num_cuotas?: number
          observaciones?: string | null
          tipo?: string
          usuario_id?: string
          valor_cuota?: number
        }
        Relationships: [
          {
            foreignKeyName: "ae_prestamos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "ae_cat_gastos"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          id: boolean
          inicio_mensaje: string | null
          inicio_titulo: string | null
          inicio_video_url: string | null
          updated_at: string
        }
        Insert: {
          id?: boolean
          inicio_mensaje?: string | null
          inicio_titulo?: string | null
          inicio_video_url?: string | null
          updated_at?: string
        }
        Update: {
          id?: boolean
          inicio_mensaje?: string | null
          inicio_titulo?: string | null
          inicio_video_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bonos: {
        Row: {
          anio: number
          created_at: string
          estado: string
          frecuencia: string
          id: string
          mes: number
          monto: number
          motivo: string | null
          otorgado_por: string | null
          profesor_id: string
          tipo: string
        }
        Insert: {
          anio: number
          created_at?: string
          estado?: string
          frecuencia?: string
          id?: string
          mes: number
          monto: number
          motivo?: string | null
          otorgado_por?: string | null
          profesor_id: string
          tipo: string
        }
        Update: {
          anio?: number
          created_at?: string
          estado?: string
          frecuencia?: string
          id?: string
          mes?: number
          monto?: number
          motivo?: string | null
          otorgado_por?: string | null
          profesor_id?: string
          tipo?: string
        }
        Relationships: []
      }
      calificaciones_mensuales: {
        Row: {
          alumna_id: string
          anio: number
          claridad: number | null
          comentario: string | null
          created_at: string
          desenvolvimiento: number | null
          didactica: number | null
          id: string
          mes: number
          practico: number | null
          profesor_id: string
        }
        Insert: {
          alumna_id: string
          anio: number
          claridad?: number | null
          comentario?: string | null
          created_at?: string
          desenvolvimiento?: number | null
          didactica?: number | null
          id?: string
          mes: number
          practico?: number | null
          profesor_id: string
        }
        Update: {
          alumna_id?: string
          anio?: number
          claridad?: number | null
          comentario?: string | null
          created_at?: string
          desenvolvimiento?: number | null
          didactica?: number | null
          id?: string
          mes?: number
          practico?: number | null
          profesor_id?: string
        }
        Relationships: []
      }
      canal_general_mensajes: {
        Row: {
          anclado: boolean
          autor_id: string
          contenido: string | null
          created_at: string
          eliminado: boolean
          id: string
          media_url: string | null
          tipo: string
        }
        Insert: {
          anclado?: boolean
          autor_id: string
          contenido?: string | null
          created_at?: string
          eliminado?: boolean
          id?: string
          media_url?: string | null
          tipo?: string
        }
        Update: {
          anclado?: boolean
          autor_id?: string
          contenido?: string | null
          created_at?: string
          eliminado?: boolean
          id?: string
          media_url?: string | null
          tipo?: string
        }
        Relationships: []
      }
      chat_profesores_mensajes: {
        Row: {
          autor_id: string
          contenido: string | null
          created_at: string
          eliminado: boolean
          id: string
          media_url: string | null
          tipo: string
        }
        Insert: {
          autor_id: string
          contenido?: string | null
          created_at?: string
          eliminado?: boolean
          id?: string
          media_url?: string | null
          tipo?: string
        }
        Update: {
          autor_id?: string
          contenido?: string | null
          created_at?: string
          eliminado?: boolean
          id?: string
          media_url?: string | null
          tipo?: string
        }
        Relationships: []
      }
      chats_1a1: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          usuario_a_id: string
          usuario_b_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          usuario_a_id: string
          usuario_b_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          usuario_a_id?: string
          usuario_b_id?: string
        }
        Relationships: []
      }
      clases_en_vivo: {
        Row: {
          created_at: string
          created_by: string | null
          descripcion: string | null
          fecha: string
          hora_fin: string
          hora_inicio: string
          id: string
          profesor_id: string | null
          recordatorio_enviado: boolean | null
          titulo: string
          zoom_link: string | null
          zoom_meeting_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          fecha: string
          hora_fin: string
          hora_inicio: string
          id?: string
          profesor_id?: string | null
          recordatorio_enviado?: boolean | null
          titulo: string
          zoom_link?: string | null
          zoom_meeting_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          fecha?: string
          hora_fin?: string
          hora_inicio?: string
          id?: string
          profesor_id?: string | null
          recordatorio_enviado?: boolean | null
          titulo?: string
          zoom_link?: string | null
          zoom_meeting_id?: string | null
        }
        Relationships: []
      }
      cursos: {
        Row: {
          color_cover: string | null
          created_at: string
          descripcion: string | null
          id: string
          image_url: string | null
          nombre: string
          orden: number
        }
        Insert: {
          color_cover?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          image_url?: string | null
          nombre: string
          orden?: number
        }
        Update: {
          color_cover?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          image_url?: string | null
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      disponibilidad: {
        Row: {
          activo: boolean
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id: string
          profesor_id: string
        }
        Insert: {
          activo?: boolean
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id?: string
          profesor_id: string
        }
        Update: {
          activo?: boolean
          dia_semana?: number
          hora_fin?: string
          hora_inicio?: string
          id?: string
          profesor_id?: string
        }
        Relationships: []
      }
      horas_trabajadas: {
        Row: {
          fecha: string
          horas: number
          id: string
          monto: number
          profesor_id: string
          referencia_id: string | null
          tarifa: number
          tipo: string
        }
        Insert: {
          fecha: string
          horas: number
          id?: string
          monto: number
          profesor_id: string
          referencia_id?: string | null
          tarifa: number
          tipo: string
        }
        Update: {
          fecha?: string
          horas?: number
          id?: string
          monto?: number
          profesor_id?: string
          referencia_id?: string | null
          tarifa?: number
          tipo?: string
        }
        Relationships: []
      }
      ia_bot_interacciones: {
        Row: {
          created_at: string
          id: string
          pregunta: string
          respuesta: string | null
          sugirio_agendar: boolean | null
          usuario_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pregunta: string
          respuesta?: string | null
          sugirio_agendar?: boolean | null
          usuario_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pregunta?: string
          respuesta?: string | null
          sugirio_agendar?: boolean | null
          usuario_id?: string
        }
        Relationships: []
      }
      lecciones: {
        Row: {
          bunny_video_id: string | null
          descripcion: string | null
          duracion_min: number | null
          id: string
          modulo_id: string
          nombre: string
          orden: number
          recursos_adjuntos: Json | null
        }
        Insert: {
          bunny_video_id?: string | null
          descripcion?: string | null
          duracion_min?: number | null
          id?: string
          modulo_id: string
          nombre: string
          orden?: number
          recursos_adjuntos?: Json | null
        }
        Update: {
          bunny_video_id?: string | null
          descripcion?: string | null
          duracion_min?: number | null
          id?: string
          modulo_id?: string
          nombre?: string
          orden?: number
          recursos_adjuntos?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lecciones_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "modulos_curso"
            referencedColumns: ["id"]
          },
        ]
      }
      mensajes_chat_1a1: {
        Row: {
          autor_id: string
          chat_id: string
          contenido: string | null
          created_at: string
          eliminado: boolean
          id: string
          leido: boolean
          media_url: string | null
          tipo: string
        }
        Insert: {
          autor_id: string
          chat_id: string
          contenido?: string | null
          created_at?: string
          eliminado?: boolean
          id?: string
          leido?: boolean
          media_url?: string | null
          tipo?: string
        }
        Update: {
          autor_id?: string
          chat_id?: string
          contenido?: string | null
          created_at?: string
          eliminado?: boolean
          id?: string
          leido?: boolean
          media_url?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_chat_1a1_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats_1a1"
            referencedColumns: ["id"]
          },
        ]
      }
      modulos_curso: {
        Row: {
          curso_id: string
          descripcion: string | null
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          curso_id: string
          descripcion?: string | null
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          curso_id?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "modulos_curso_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "cursos"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_mensuales: {
        Row: {
          anio: number
          estado: string
          fecha_pago: string | null
          id: string
          mes: number
          monto_total: number
          profesor_id: string
          total_bonos: number
          total_horas: number
        }
        Insert: {
          anio: number
          estado?: string
          fecha_pago?: string | null
          id?: string
          mes: number
          monto_total?: number
          profesor_id: string
          total_bonos?: number
          total_horas?: number
        }
        Update: {
          anio?: number
          estado?: string
          fecha_pago?: string | null
          id?: string
          mes?: number
          monto_total?: number
          profesor_id?: string
          total_bonos?: number
          total_horas?: number
        }
        Relationships: []
      }
      permisos_cursos: {
        Row: {
          curso_id: string
          fecha_otorgado: string
          id: string
          otorgado_por: string | null
          usuario_id: string
        }
        Insert: {
          curso_id: string
          fecha_otorgado?: string
          id?: string
          otorgado_por?: string | null
          usuario_id: string
        }
        Update: {
          curso_id?: string
          fecha_otorgado?: string
          id?: string
          otorgado_por?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permisos_cursos_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "cursos"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          estado: Database["public"]["Enums"]["user_estado"]
          id: string
          negocio_foto_url: string | null
          negocio_nombre: string | null
          nombre_completo: string
          tarifa_hora_clase: number
          tarifa_sesion_1a1: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          estado?: Database["public"]["Enums"]["user_estado"]
          id: string
          negocio_foto_url?: string | null
          negocio_nombre?: string | null
          nombre_completo?: string
          tarifa_hora_clase?: number
          tarifa_sesion_1a1?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          estado?: Database["public"]["Enums"]["user_estado"]
          id?: string
          negocio_foto_url?: string | null
          negocio_nombre?: string | null
          nombre_completo?: string
          tarifa_hora_clase?: number
          tarifa_sesion_1a1?: number
          updated_at?: string
        }
        Relationships: []
      }
      progreso_lecciones: {
        Row: {
          completada: boolean
          fecha_completada: string | null
          leccion_id: string
          minutos_visto: number | null
          usuario_id: string
        }
        Insert: {
          completada?: boolean
          fecha_completada?: string | null
          leccion_id: string
          minutos_visto?: number | null
          usuario_id: string
        }
        Update: {
          completada?: boolean
          fecha_completada?: string | null
          leccion_id?: string
          minutos_visto?: number | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progreso_lecciones_leccion_id_fkey"
            columns: ["leccion_id"]
            isOneToOne: false
            referencedRelation: "lecciones"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sesiones_1a1: {
        Row: {
          alumna_id: string
          created_at: string
          estado: string
          fecha: string
          finalizada_at: string | null
          hora_fin: string
          hora_inicio: string
          id: string
          profesor_id: string
          zoom_link: string | null
          zoom_meeting_id: string | null
        }
        Insert: {
          alumna_id: string
          created_at?: string
          estado?: string
          fecha: string
          finalizada_at?: string | null
          hora_fin: string
          hora_inicio: string
          id?: string
          profesor_id: string
          zoom_link?: string | null
          zoom_meeting_id?: string | null
        }
        Update: {
          alumna_id?: string
          created_at?: string
          estado?: string
          fecha?: string
          finalizada_at?: string | null
          hora_fin?: string
          hora_inicio?: string
          id?: string
          profesor_id?: string
          zoom_link?: string | null
          zoom_meeting_id?: string | null
        }
        Relationships: []
      }
      soporte_privado_mensajes: {
        Row: {
          autor_id: string
          contenido: string | null
          created_at: string
          id: string
          leido: boolean
          media_url: string | null
          tipo: string
          usuario_id: string
        }
        Insert: {
          autor_id: string
          contenido?: string | null
          created_at?: string
          id?: string
          leido?: boolean
          media_url?: string | null
          tipo?: string
          usuario_id: string
        }
        Update: {
          autor_id?: string
          contenido?: string | null
          created_at?: string
          id?: string
          leido?: boolean
          media_url?: string | null
          tipo?: string
          usuario_id?: string
        }
        Relationships: []
      }
      tareas: {
        Row: {
          created_at: string
          created_by: string
          curso_id: string | null
          descripcion: string | null
          fecha_limite: string | null
          id: string
          titulo: string
        }
        Insert: {
          created_at?: string
          created_by: string
          curso_id?: string | null
          descripcion?: string | null
          fecha_limite?: string | null
          id?: string
          titulo: string
        }
        Update: {
          created_at?: string
          created_by?: string
          curso_id?: string | null
          descripcion?: string | null
          fecha_limite?: string | null
          id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "tareas_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "cursos"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas_entregas: {
        Row: {
          alumna_id: string
          archivo_nombre: string
          archivo_tipo: string | null
          archivo_url: string
          calificacion: number | null
          comentario: string | null
          created_at: string
          feedback: string | null
          id: string
          tarea_id: string
        }
        Insert: {
          alumna_id: string
          archivo_nombre: string
          archivo_tipo?: string | null
          archivo_url: string
          calificacion?: number | null
          comentario?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          tarea_id: string
        }
        Update: {
          alumna_id?: string
          archivo_nombre?: string
          archivo_tipo?: string | null
          archivo_url?: string
          calificacion?: number | null
          comentario?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          tarea_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tareas_entregas_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "soporte" | "usuario"
      user_estado: "pendiente_aprobacion" | "activo" | "inactivo"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "soporte", "usuario"],
      user_estado: ["pendiente_aprobacion", "activo", "inactivo"],
    },
  },
} as const
