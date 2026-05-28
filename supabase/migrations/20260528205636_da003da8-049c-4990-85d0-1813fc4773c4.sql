ALTER TABLE public.ae_cat_gastos DROP CONSTRAINT IF EXISTS ae_cat_gastos_tipo_check;
UPDATE public.ae_cat_gastos SET tipo = 'gasto variable' WHERE tipo = 'variable';
ALTER TABLE public.ae_cat_gastos ADD CONSTRAINT ae_cat_gastos_tipo_check CHECK (tipo IN ('gasto fijo','gasto variable','gasto','prestamo','ingreso','ingreso variable'));
ALTER TABLE public.ae_cat_gastos ALTER COLUMN tipo SET DEFAULT 'gasto variable';