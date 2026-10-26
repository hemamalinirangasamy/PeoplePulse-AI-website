-- PeoplePulse AI: private admin reads and public survey submissions.
-- Run this in Supabase SQL Editor after selecting your project.

create table if not exists public.survey_submissions (
  submission_id text primary key,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  constraint survey_submission_id_matches_data
    check (submission_id = data->>'id')
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin'))
);

alter table public.survey_submissions enable row level security;
alter table public.user_roles enable row level security;

create or replace function public.is_peoplepulse_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_peoplepulse_admin() from public;
grant execute on function public.is_peoplepulse_admin() to authenticated;

revoke all on table public.survey_submissions from anon, authenticated;
grant insert on table public.survey_submissions to anon, authenticated;
grant select, delete on table public.survey_submissions to authenticated;

revoke all on table public.user_roles from anon, authenticated;
grant select on table public.user_roles to authenticated;

drop policy if exists "Anyone can submit a survey response" on public.survey_submissions;
create policy "Anyone can submit a survey response"
  on public.survey_submissions for insert to anon, authenticated
  with check (jsonb_typeof(data) = 'object' and submission_id = data->>'id');

drop policy if exists "Admins can read all survey responses" on public.survey_submissions;
create policy "Admins can read all survey responses"
  on public.survey_submissions for select to authenticated
  using ((select public.is_peoplepulse_admin()));

drop policy if exists "Admins can delete survey responses" on public.survey_submissions;
create policy "Admins can delete survey responses"
  on public.survey_submissions for delete to authenticated
  using ((select public.is_peoplepulse_admin()));

drop policy if exists "Users can check their own admin role" on public.user_roles;
create policy "Users can check their own admin role"
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()));

insert into public.user_roles (user_id, role)
values ('2b7213ac-f821-4d85-88d4-612c84b19cba', 'admin')
on conflict (user_id) do update set role = excluded.role;

-- Registered users live here; Supabase Auth remains the password store.
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null,
  gender text not null default '',
  mobile text not null default '',
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.user_login_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_in_at timestamptz not null default now(),
  logged_out_at timestamptz
);

create index if not exists user_login_activity_user_time_idx
  on public.user_login_activity (user_id, logged_in_at desc);

alter table public.user_profiles enable row level security;
alter table public.user_login_activity enable row level security;

revoke all on table public.user_profiles from anon, authenticated;
grant select on table public.user_profiles to authenticated;
revoke all on table public.user_login_activity from anon, authenticated;
grant select on table public.user_login_activity to authenticated;

drop policy if exists "Users can read their own profile or admins can read all" on public.user_profiles;
create policy "Users can read their own profile or admins can read all"
  on public.user_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_peoplepulse_admin()));

drop policy if exists "Users can read their own activity or admins can read all" on public.user_login_activity;
create policy "Users can read their own activity or admins can read all"
  on public.user_login_activity for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_peoplepulse_admin()));

drop policy if exists "Admins can read role assignments" on public.user_roles;
create policy "Admins can read role assignments"
  on public.user_roles for select to authenticated
  using ((select public.is_peoplepulse_admin()));

create or replace function public.handle_new_peoplepulse_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (user_id, full_name, email, gender, mobile, created_at, last_login_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'gender', ''),
    coalesce(new.raw_user_meta_data->>'mobile', ''),
    new.created_at,
    new.last_sign_in_at
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists peoplepulse_on_auth_user_created on auth.users;
create trigger peoplepulse_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_peoplepulse_user();
revoke all on function public.handle_new_peoplepulse_user() from public, anon, authenticated;

-- Backfill existing Supabase Auth accounts. No passwords are copied.
insert into public.user_profiles (user_id, full_name, email, gender, mobile, created_at, last_login_at)
select
  id,
  coalesce(raw_user_meta_data->>'name', raw_user_meta_data->>'full_name', ''),
  coalesce(email, ''),
  coalesce(raw_user_meta_data->>'gender', ''),
  coalesce(raw_user_meta_data->>'mobile', ''),
  created_at,
  last_sign_in_at
from auth.users
on conflict (user_id) do nothing;

create or replace function public.record_peoplepulse_login()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_event_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;
  insert into public.user_login_activity (user_id)
  values (current_user_id)
  returning id into new_event_id;
  update public.user_profiles set last_login_at = now() where user_id = current_user_id;
  return new_event_id;
end;
$$;

create or replace function public.record_peoplepulse_logout(event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  update public.user_login_activity
  set logged_out_at = now()
  where id = event_id and user_id = auth.uid() and logged_out_at is null;
end;
$$;

revoke all on function public.record_peoplepulse_login() from public;
grant execute on function public.record_peoplepulse_login() to authenticated;
revoke all on function public.record_peoplepulse_logout(uuid) from public;
grant execute on function public.record_peoplepulse_logout(uuid) to authenticated;

-- Refresh PostgREST's function cache so browser RPC calls can see the new functions.
notify pgrst, 'reload schema';

select to_regprocedure('public.record_peoplepulse_login()');