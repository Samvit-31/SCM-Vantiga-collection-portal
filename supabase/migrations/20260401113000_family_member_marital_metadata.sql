alter table public.family_members
add column if not exists is_married boolean not null default false;

alter table public.family_members
add column if not exists maiden_surname text;

alter table public.family_members
add column if not exists other_gotra text;
