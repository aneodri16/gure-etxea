-- Gure etxea: Supabase RLS politikak
-- Exekutatu Supabase Dashboard > SQL Editor-en.
-- Aplikazio honetan autentifikatutako etxeko erabiltzaileek datu guztiak partekatzen dituzte.

do $$
declare
  taula text;
begin
  foreach taula in array array[
    'platerak',
    'osagaiak',
    'plater_osagaiak',
    'aste_plangintza',
    'erosketa_zerrenda',
    'etxeko_oharrak',
    'checklist_elementuak',
    'spotify_zerrendak'
  ]
  loop
    execute format('drop policy if exists "authenticated_select_%s" on public.%I', taula, taula);
    execute format('drop policy if exists "authenticated_insert_%s" on public.%I', taula, taula);
    execute format('drop policy if exists "authenticated_update_%s" on public.%I', taula, taula);
    execute format('drop policy if exists "authenticated_delete_%s" on public.%I', taula, taula);

    execute format('create policy "authenticated_select_%s" on public.%I for select to authenticated using (true)', taula, taula);
    execute format('create policy "authenticated_insert_%s" on public.%I for insert to authenticated with check (true)', taula, taula);
    execute format('create policy "authenticated_update_%s" on public.%I for update to authenticated using (true) with check (true)', taula, taula);
    execute format('create policy "authenticated_delete_%s" on public.%I for delete to authenticated using (true)', taula, taula);

    execute format('grant select, insert, update, delete on table public.%I to authenticated', taula, taula);
  end loop;
end $$;
