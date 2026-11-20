begin;

create table public.enchanted_rooms (
  id uuid primary key,
  secret text not null,
  data jsonb not null,
  revision integer not null default 0 check (revision >= 0)
);
alter table public.enchanted_rooms enable row level security;
revoke all on public.enchanted_rooms from public, anon, authenticated;
grant select, insert, update on public.enchanted_rooms to service_role;

-- Realtime events contain only a room identifier and revision.
create table public.enchanted_room_updates (
  id text primary key,
  revision integer not null
);
alter table public.enchanted_room_updates enable row level security;
revoke all on public.enchanted_room_updates from public, anon, authenticated;
grant select on public.enchanted_room_updates to anon, authenticated;
create policy "Read live revision" on public.enchanted_room_updates
  for select to anon, authenticated using (true);

create function public.enchanted_signal_room() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.enchanted_room_updates(id, revision)
  values (encode(sha256(convert_to(new.id::text, 'UTF8')), 'hex'), new.revision)
  on conflict (id) do update set revision = excluded.revision;
  return new;
end;
$$;
revoke all on function public.enchanted_signal_room() from public, anon, authenticated;
grant insert, update, select on public.enchanted_room_updates to service_role;
grant execute on function public.enchanted_signal_room() to service_role;
create trigger enchanted_room_changed after insert or update on public.enchanted_rooms
  for each row execute function public.enchanted_signal_room();

alter publication supabase_realtime add table public.enchanted_room_updates;

commit;
