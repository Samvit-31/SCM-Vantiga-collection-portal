alter table public.vantiga_entries
add column if not exists entry_type text;

update public.vantiga_entries
set entry_type = 'Vantiga'
where entry_type is null;

alter table public.vantiga_entries
alter column entry_type set default 'Vantiga';

alter table public.vantiga_entries
alter column entry_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vantiga_entries_entry_type_check'
  ) then
    alter table public.vantiga_entries
    add constraint vantiga_entries_entry_type_check
    check (entry_type in ('Vantiga', 'Math Maryada'));
  end if;
end $$;
