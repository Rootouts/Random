-- profiles (1:1 with auth.users)
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text,
  gender        text check (gender in ('male','female','other')),
  loc           text,
  lat           double precision,
  lng           double precision,
  premium       boolean default false,
  premium_until timestamptz,
  role          text default 'user',
  created_at    timestamptz default now()
);

create table public.messages (
  id         bigint generated always as identity primary key,
  room_id    text,
  sender     uuid references public.profiles(id),
  text       text,
  created_at timestamptz default now()
);

create table public.calls (
  id         bigint generated always as identity primary key,
  room_id    text, a uuid, b uuid,
  started_at timestamptz default now(), ended_at timestamptz
);

create table public.friends (
  user_id   uuid references public.profiles(id) on delete cascade,
  friend_id uuid references public.profiles(id) on delete cascade,
  status    text default 'pending',
  created_at timestamptz default now(),
  primary key (user_id, friend_id)
);

-- auto-create a profile on signup
create function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data->>'name','User'));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.friends  enable row level security;

create policy "own profile read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);
create policy "admin reads all"     on public.profiles for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "insert own messages"  on public.messages for insert with check (auth.uid() = sender);
create policy "admin reads messages" on public.messages for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "own friends" on public.friends for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
