
-- Allow all authenticated users to see profiles of staff (admin/soporte) so students can find professors in chats and 1a1 agenda
DROP POLICY IF EXISTS profiles_select_scoped ON public.profiles;
CREATE POLICY profiles_select_scoped ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'soporte'::app_role)
  OR has_role(id, 'admin'::app_role)
  OR has_role(id, 'soporte'::app_role)
);

-- Allow students to see live classes that have no course assigned (general classes for everyone)
DROP POLICY IF EXISTS clases_select ON public.clases_en_vivo;
CREATE POLICY clases_select ON public.clases_en_vivo
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'soporte'::app_role)
  OR profesor_id = auth.uid()
  OR curso_id IS NULL
  OR EXISTS (
    SELECT 1 FROM permisos_cursos pc
    WHERE pc.usuario_id = auth.uid() AND pc.curso_id = clases_en_vivo.curso_id
  )
);
