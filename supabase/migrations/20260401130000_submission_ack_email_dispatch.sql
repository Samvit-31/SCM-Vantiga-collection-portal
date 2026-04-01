create table if not exists public.submission_ack_email_dispatch (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.vantiga_entries(id) on delete cascade,
  submitted_at timestamptz not null,
  payer_email text,
  paid_by text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists submission_ack_email_dispatch_entry_submitted_uidx
  on public.submission_ack_email_dispatch(entry_id, submitted_at);

create index if not exists submission_ack_email_dispatch_status_updated_idx
  on public.submission_ack_email_dispatch(status, updated_at);

create or replace function public.set_submission_ack_email_dispatch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_submission_ack_email_dispatch_updated_at on public.submission_ack_email_dispatch;
create trigger trg_set_submission_ack_email_dispatch_updated_at
before update on public.submission_ack_email_dispatch
for each row
execute function public.set_submission_ack_email_dispatch_updated_at();

create or replace function public.enqueue_submission_ack_email_dispatch()
returns trigger
language plpgsql
as $$
declare
  v_payer_email text;
  v_submitted_at timestamptz;
begin
  if new.status <> 'SUBMITTED' then
    return new;
  end if;

  if coalesce(new.paid_by::text, '') = 'Cash' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(old.submitted_at, 'epoch'::timestamptz) = coalesce(new.submitted_at, 'epoch'::timestamptz)
      and old.status is not distinct from new.status
      and old.paid_by is not distinct from new.paid_by then
      return new;
    end if;
  end if;

  select f.payer_email
    into v_payer_email
  from public.families f
  where f.id = new.family_id;

  if coalesce(btrim(v_payer_email), '') = '' then
    return new;
  end if;

  v_submitted_at := coalesce(new.submitted_at, now());

  insert into public.submission_ack_email_dispatch (
    entry_id,
    submitted_at,
    payer_email,
    paid_by,
    status,
    attempt_count
  )
  values (
    new.id,
    v_submitted_at,
    v_payer_email,
    new.paid_by::text,
    'pending',
    0
  )
  on conflict (entry_id, submitted_at) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_submission_ack_email_dispatch on public.vantiga_entries;
create trigger trg_enqueue_submission_ack_email_dispatch
after insert or update on public.vantiga_entries
for each row
execute function public.enqueue_submission_ack_email_dispatch();
