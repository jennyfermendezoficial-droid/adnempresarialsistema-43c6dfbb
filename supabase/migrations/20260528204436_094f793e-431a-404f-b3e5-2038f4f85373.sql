ALTER TABLE public.ae_cat_gastos DROP CONSTRAINT IF EXISTS ae_cat_gastos_tipo_check;
UPDATE public.ae_cat_gastos SET tipo = 'gasto fijo' WHERE tipo = 'fijo';
ALTER TABLE public.ae_cat_gastos ADD CONSTRAINT ae_cat_gastos_tipo_check CHECK (tipo IN ('gasto fijo','variable','gasto','prestamo','ingreso'));