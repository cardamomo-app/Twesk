-- One private adventure per account. Clients may read their own save; writes must
-- use the compare-and-swap function so two devices cannot silently overwrite it.
create table public.twesk_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  cloud_version bigint not null default 1 check (cloud_version > 0),
  updated_at timestamptz not null default now(),
  constraint valid_adventure check (jsonb_typeof(payload) = 'object' and payload->>'version' = '1' and octet_length(payload::text) <= 5000000)
);
alter table public.twesk_saves enable row level security;
revoke all on public.twesk_saves from anon, authenticated;
grant select on public.twesk_saves to authenticated;
create policy "Read own adventure" on public.twesk_saves for select to authenticated using ((select auth.uid()) = user_id);

create function public.twesk_save(p_payload jsonb, p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_row public.twesk_saves;
begin
  if v_user is null then raise exception 'Sign in required' using errcode = '28000'; end if;
  if p_expected_version is null or p_expected_version < 0 then raise exception 'Invalid version'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or p_payload->>'version' is distinct from '1' or octet_length(p_payload::text) > 5000000 then
    raise exception 'Invalid adventure';
  end if;
  -- Lock absent rows too, making first-save races safe.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select * into v_row from public.twesk_saves where user_id = v_user for update;
  if coalesce(v_row.cloud_version, 0) <> p_expected_version then
    return jsonb_build_object('conflict', true, 'cloud_version', v_row.cloud_version, 'payload', v_row.payload, 'updated_at', v_row.updated_at);
  end if;
  insert into public.twesk_saves(user_id, payload) values(v_user, p_payload)
  on conflict(user_id) do update set payload = excluded.payload, cloud_version = public.twesk_saves.cloud_version + 1, updated_at = now()
  returning * into v_row;
  return jsonb_build_object('conflict', false, 'cloud_version', v_row.cloud_version, 'payload', v_row.payload, 'updated_at', v_row.updated_at);
end;
$$;
revoke all on function public.twesk_save(jsonb, bigint) from public, anon;
grant execute on function public.twesk_save(jsonb, bigint) to authenticated;
