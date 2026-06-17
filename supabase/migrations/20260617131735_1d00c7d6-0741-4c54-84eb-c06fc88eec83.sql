
ALTER TABLE public.sesiones_1a1 ADD COLUMN IF NOT EXISTS motivo text;
ALTER TABLE public.sesiones_1a1 ADD CONSTRAINT sesiones_1a1_motivo_len CHECK (motivo IS NULL OR char_length(motivo) <= 100);
