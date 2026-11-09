-- Per-user progress for optional cross-device sync. No student content is public.
create table if not exists public.mindspark_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint mindspark_progress_payload_size check (octet_length(payload::text) <= 2000000)
);

alter table public.mindspark_progress enable row level security;
alter table public.mindspark_progress force row level security;

create policy "Learners can read their own progress"
  on public.mindspark_progress for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Learners can add their own progress"
  on public.mindspark_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Learners can update their own progress"
  on public.mindspark_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.mindspark_progress to authenticated;
revoke all on public.mindspark_progress from anon;
