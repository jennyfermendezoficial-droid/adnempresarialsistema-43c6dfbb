ALTER TABLE public.ae_cat_gastos
DROP CONSTRAINT IF EXISTS ae_cat_gastos_tipo_check;

ALTER TABLE public.ae_cat_gastos
ADD CONSTRAINT ae_cat_gastos_tipo_check
CHECK (tipo IN ('gasto fijo','gasto variable','gasto','prestamo','ingreso','ingreso variable','proveedor'));

ALTER TABLE public.ae_cat_gastos
ALTER COLUMN tipo SET DEFAULT 'gasto variable';