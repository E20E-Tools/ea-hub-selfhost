ALTER TABLE public.products ADD COLUMN publication_date date;
UPDATE public.products SET publication_date = DATE '2026-11-22' WHERE id = 'archone';
COMMENT ON COLUMN public.products.publication_date IS 'Optional planned publication date, editable in the product information settings.';