-- =====================================================================
-- LoteControl · esquema para Supabase (un software por proyecto)
-- Ejecutar UNA vez en Supabase → SQL Editor → New query → Run.
-- Es seguro repetirlo: no borra datos.
-- =====================================================================

-- ---------- tablas ----------
create table if not exists public.proyectos (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Un lote = un documento JSON (igual que en la versión de demostración) + control de versión.
create table if not exists public.lotes (
  id         text primary key,
  proyecto   text not null,
  data       jsonb not null,
  version    integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists lotes_proyecto_idx on public.lotes (proyecto);

-- Capturas de transferencias (versión demo: en la base; en producción irán a Storage).
create table if not exists public.comprobantes (
  id   text primary key,
  lote text not null,
  img  text not null,
  por  uuid default auth.uid(),
  ts   timestamptz not null default now()
);

-- Contador de recibos: una sola fila.
create table if not exists public.consecutivo (
  id       integer primary key default 1 check (id = 1),
  ultimo   integer not null default 0,
  anulados jsonb not null default '[]'::jsonb
);
insert into public.consecutivo (id) values (1) on conflict do nothing;

-- Nombre visible de cada usuario (para "registrado por …").
create table if not exists public.perfiles (
  id     uuid primary key references auth.users (id) on delete cascade,
  nombre text not null
);

create or replace function public.nuevo_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'nombre', ''), split_part(new.email, '@', 1)))
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.nuevo_perfil();

-- Perfiles de usuarios que ya existan antes de correr este script.
insert into public.perfiles (id, nombre)
select id, coalesce(nullif(raw_user_meta_data->>'nombre', ''), split_part(email, '@', 1)) from auth.users
on conflict do nothing;

-- ---------- escritura segura: todo o nada, con control de versión ----------
-- p_esperada = versión del lote que el cliente leyó (0 si el lote aún no existe en la base).
-- Si alguien lo cambió mientras tanto, devuelve conflicto y NO guarda nada.
-- p_con_recibo = true: dentro de la MISMA transacción toma el siguiente número de recibo
-- (reemplaza {{N}} en los textos y pone el número en el pago nuevo, el que trae "recibo": 0).
-- Si algo falla, el número tampoco se consume: no hay huecos ni repetidos.
create or replace function public.guardar_lote(p_id text, p_esperada integer, p_data jsonb, p_con_recibo boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actual public.lotes%rowtype;
  v_n integer;
  v_version integer;
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext('lote:' || p_id));   -- un cambio a la vez por lote

  select * into v_actual from public.lotes where id = p_id;
  if found then
    if v_actual.version <> p_esperada then
      return jsonb_build_object('ok', false, 'conflicto', true, 'version', v_actual.version, 'data', v_actual.data);
    end if;
  elsif p_esperada <> 0 then
    return jsonb_build_object('ok', false, 'conflicto', true, 'version', 0, 'data', null);
  end if;

  if p_con_recibo then
    update public.consecutivo set ultimo = ultimo + 1 where id = 1 returning ultimo into v_n;
    p_data := replace(p_data::text, '{{N}}', lpad(v_n::text, 6, '0'))::jsonb;
    p_data := jsonb_set(p_data, '{pagos}', coalesce((
      select jsonb_agg(case when coalesce((e->>'recibo')::int, -1) = 0 then jsonb_set(e, '{recibo}', to_jsonb(v_n)) else e end order by ord)
      from jsonb_array_elements(p_data->'pagos') with ordinality t(e, ord)
    ), '[]'::jsonb));
  end if;

  insert into public.lotes (id, proyecto, data, version, updated_by)
  values (p_id, coalesce(p_data->>'proyecto', 'montecarlo'), p_data, 1, auth.uid())
  on conflict (id) do update
    set data = excluded.data, version = public.lotes.version + 1, updated_at = now(), updated_by = auth.uid()
  returning version into v_version;

  return jsonb_build_object('ok', true, 'version', v_version, 'recibo', v_n, 'data', p_data);
end $$;

create or replace function public.guardar_proyecto(p_id text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'no_autenticado' using errcode = '28000'; end if;
  insert into public.proyectos (id, data) values (p_id, p_data)
  on conflict (id) do update set data = excluded.data, updated_at = now();
end $$;

-- ---------- permisos (RLS): solo usuarios con sesión; nadie escribe lotes ni contador directamente ----------
alter table public.proyectos     enable row level security;
alter table public.lotes         enable row level security;
alter table public.comprobantes  enable row level security;
alter table public.consecutivo   enable row level security;
alter table public.perfiles      enable row level security;

drop policy if exists leer_proyectos    on public.proyectos;
drop policy if exists leer_lotes        on public.lotes;
drop policy if exists leer_comprobantes on public.comprobantes;
drop policy if exists crear_comprobante on public.comprobantes;
drop policy if exists leer_consecutivo  on public.consecutivo;
drop policy if exists leer_perfiles     on public.perfiles;

create policy leer_proyectos    on public.proyectos    for select to authenticated using (true);
create policy leer_lotes        on public.lotes        for select to authenticated using (true);
create policy leer_comprobantes on public.comprobantes for select to authenticated using (true);
create policy crear_comprobante on public.comprobantes for insert to authenticated with check (por = auth.uid());
create policy leer_consecutivo  on public.consecutivo  for select to authenticated using (true);
create policy leer_perfiles     on public.perfiles     for select to authenticated using (true);

-- Permisos exactos (Supabase ya no los entrega por defecto): anon nada; authenticated lee todo y solo crea comprobantes.
-- Los lotes y el consecutivo se escriben únicamente por guardar_lote / guardar_proyecto.
revoke all on public.proyectos, public.lotes, public.comprobantes, public.consecutivo, public.perfiles from anon;
revoke all on public.proyectos, public.lotes, public.comprobantes, public.consecutivo, public.perfiles from authenticated;
grant select on public.proyectos, public.lotes, public.comprobantes, public.consecutivo, public.perfiles to authenticated;
grant insert on public.comprobantes to authenticated;

revoke all on function public.guardar_lote(text, integer, jsonb, boolean) from public, anon;
revoke all on function public.guardar_proyecto(text, jsonb) from public, anon;
grant execute on function public.guardar_lote(text, integer, jsonb, boolean) to authenticated;
grant execute on function public.guardar_proyecto(text, jsonb) to authenticated;

-- ---------- tiempo real ----------
do $$ begin
  begin alter publication supabase_realtime add table public.lotes;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.proyectos;  exception when duplicate_object then null; end;
end $$;

-- ---------- datos iniciales ----------
insert into public.proyectos (id, data) values ('montecarlo', jsonb_build_object(
  'nombre', 'Condominio Campestre Montecarlo', 'ubicacion', 'Acacías, Meta', 'plano', 'plano-montecarlo.json',
  'tema', 'montecarlo', 'valorM2', 0, 'sepValor', 500000, 'ciPct', 20, 'cuotas', 24, 'creado', (extract(epoch from now()) * 1000)::bigint
)) on conflict (id) do nothing;
