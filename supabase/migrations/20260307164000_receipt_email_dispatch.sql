create table if not exists public.receipt_email_dispatch (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.vantiga_entries(id) on delete cascade,
  receipt_no text not null,
  payer_email text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists receipt_email_dispatch_entry_receipt_uidx
  on public.receipt_email_dispatch(entry_id, receipt_no);

create index if not exists receipt_email_dispatch_status_updated_idx
  on public.receipt_email_dispatch(status, updated_at);

create or replace function public.set_receipt_email_dispatch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_receipt_email_dispatch_updated_at on public.receipt_email_dispatch;
create trigger trg_set_receipt_email_dispatch_updated_at
before update on public.receipt_email_dispatch
for each row
execute function public.set_receipt_email_dispatch_updated_at();

create or replace function public.enqueue_receipt_email_dispatch()
returns trigger
language plpgsql
as $$
declare
  v_payer_email text;
begin
  if new.receipt_no is null or btrim(new.receipt_no) = '' then
    return new;
  end if;

  if tg_op = 'UPDATE' and coalesce(old.receipt_no, '') = coalesce(new.receipt_no, '') then
    return new;
  end if;

  select f.payer_email
    into v_payer_email
  from public.families f
  where f.id = new.family_id;

  insert into public.receipt_email_dispatch (
    entry_id,
    receipt_no,
    payer_email,
    status,
    attempt_count
  )
  values (
    new.id,
    new.receipt_no,
    v_payer_email,
    'pending',
    0
  )
  on conflict (entry_id, receipt_no) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_receipt_email_dispatch on public.vantiga_entries;
create trigger trg_enqueue_receipt_email_dispatch
after insert or update on public.vantiga_entries
for each row
execute function public.enqueue_receipt_email_dispatch();
