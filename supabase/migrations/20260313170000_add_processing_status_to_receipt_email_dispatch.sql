do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.receipt_email_dispatch'::regclass
      and conname = 'receipt_email_dispatch_status_check'
  ) then
    alter table public.receipt_email_dispatch
      drop constraint receipt_email_dispatch_status_check;
  end if;
end $$;

alter table public.receipt_email_dispatch
add constraint receipt_email_dispatch_status_check
check (status in ('pending', 'processing', 'sent', 'failed'));
