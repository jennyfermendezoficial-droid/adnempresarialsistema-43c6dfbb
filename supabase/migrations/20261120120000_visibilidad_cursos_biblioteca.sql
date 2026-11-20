-- ADN Empresarial: habilitar ocultación de cursos que pasan a ser módulos.
-- Esta migración NO reorganiza contenidos ni cambia permisos.
-- El valor por defecto true conserva la visibilidad actual de todos los registros.
ALTER TABLE public.cursos
  ADD COLUMN IF NOT EXISTS visible_en_biblioteca boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.cursos.visible_en_biblioteca IS
  'Indica si el registro se muestra como tarjeta independiente en las bibliotecas de cursos o clases en vivo.';
