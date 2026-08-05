CREATE POLICY "sesiones_profesor_delete"
ON public.sesiones_1a1
FOR DELETE
TO authenticated
USING (profesor_id = auth.uid() AND estado <> 'finalizada');