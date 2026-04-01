create table if not exists public.rejection_email_dispatch (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.vantiga_entries(id) on delete cascade,
  rejected_at timestamptz not null,
  payer_email text,
  rejection_reason text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rejection_email_dispatch_entry_rejected_uidx
  on public.rejection_email_dispatch(entry_id, rejected_at);

create index if not exists rejection_email_dispatch_status_updated_idx
  on public.rejection_email_dispatch(status, updated_at);

create or replace function public.set_rejection_email_dispatch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_rejection_email_dispatch_updated_at on public.rejection_email_dispatch;
create trigger trg_set_rejection_email_dispatch_updated_at
before update on public.rejection_email_dispatch
for each row
execute function public.set_rejection_email_dispatch_updated_at();

create or replace function public.enqueue_rejection_email_dispatch()
returns trigger
language plpgsql
as $$
declare
  v_payer_email text;
  v_rejected_at timestamptz;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status <> 'REJECTED' or old.status is not distinct from new.status then
    return new;
  end if;

  if coalesce(btrim(new.rejection_reason), '') = '' then
    return new;
  end if;

  select f.payer_email
    into v_payer_email
  from public.families f
  where f.id = new.family_id;

  if coalesce(btrim(v_payer_email), '') = '' then
    return new;
  end if;

  v_rejected_at := coalesce(new.acknowledged_at, now());

  insert into public.rejection_email_dispatch (
    entry_id,
    rejected_at,
    payer_email,
    rejection_reason,
    status,
    attempt_count
  )
  values (
    new.id,
    v_rejected_at,
    v_payer_email,
    btrim(new.rejection_reason),
    'pending',
    0
  )
  on conflict (entry_id, rejected_at) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_rejection_email_dispatch on public.vantiga_entries;
create trigger trg_enqueue_rejection_email_dispatch
after update on public.vantiga_entries
for each row
execute function public.enqueue_rejection_email_dispatch();
