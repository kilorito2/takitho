-- Takitho · "Promos del día" on the home page.
-- Only automatic promos (no code needed) are public, and only the columns the page needs:
-- codes, usage counters and per-phone limits stay private.
create policy promos_public on public.coupons for select to anon using (is_active and auto_apply);

grant select (id, label, kind, value, scope, scope_ids, weekdays, starts_at, ends_at, min_purchase)
  on public.coupons to anon;
