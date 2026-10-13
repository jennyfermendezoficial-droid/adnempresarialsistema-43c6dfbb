ALTER TABLE public.freelance_actividades ADD COLUMN IF NOT EXISTS valor numeric(12,2), ADD COLUMN IF NOT EXISTS observacion_lider text;
ALTER TABLE public.freelance_miembros ADD COLUMN IF NOT EXISTS tarifa_actividad numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.freelance_pagos ADD COLUMN IF NOT EXISTS cuenta_origen text, ADD COLUMN IF NOT EXISTS titular_cuenta text;