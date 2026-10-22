-- Takitho · atomic replacement of the weekly opening hours (the admin edits the whole week at once).
-- Deleting and re-inserting from the browser could leave the shop with no hours (= closed) if the second step failed.
create or replace function public.replace_opening_hours(p_shifts jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s jsonb;
begin
  if public.auth_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_shifts) is distinct from 'array' then
    raise exception 'INVALID_SHIFTS' using errcode = 'P0001';
  end if;

  delete from public.opening_hours where true;
  for s in select * from jsonb_array_elements(p_shifts) loop
    insert into public.opening_hours (weekday, opens_at, closes_at)
    values ((s ->> 'weekday')::smallint, (s ->> 'opens_at')::time, (s ->> 'closes_at')::time);
  end loop;
end;
$$;

revoke execute on function public.replace_opening_hours(jsonb) from public, anon;
grant execute on function public.replace_opening_hours(jsonb) to authenticated;
