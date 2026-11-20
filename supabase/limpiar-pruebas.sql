-- Deja la base lista para el uso real: borra los lotes de prueba (proyecto "prueba") y reinicia el consecutivo en 0.
-- ¡SOLO antes de que las secretarias emitan recibos reales! Si ya hay recibos reales, NO lo ejecutes.
-- Ejecutar en Supabase → SQL Editor.
delete from public.comprobantes where lote like 'prueba-%';
delete from public.lotes        where proyecto = 'prueba';
update public.consecutivo set ultimo = 0, anulados = '[]'::jsonb where id = 1;
select (select count(*) from public.lotes) as lotes_restantes, (select ultimo from public.consecutivo) as consecutivo;
