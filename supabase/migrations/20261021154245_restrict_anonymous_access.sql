-- Keep anonymous student flows behind Edge Functions. Direct Data API access to
-- private platform tables is reserved for permanent authenticated accounts.
-- The existing owner policies remain permissive for their ownership checks;
-- these restrictive policies add the anonymous-user guard to every operation.

create policy "activities_permanent_users_only"
on public.activities as restrictive
for all to authenticated
using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false)
with check ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

create policy "attempt_answers_permanent_users_only"
on public.attempt_answers as restrictive
for all to authenticated
using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false)
with check ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

create policy "attempts_permanent_users_only"
on public.attempts as restrictive
for all to authenticated
using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false)
with check ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

create policy "audit_events_permanent_users_only"
on public.audit_events as restrictive
for all to authenticated
using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false)
with check ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

create policy "evaluation_templates_permanent_users_only"
on public.evaluation_templates as restrictive
for all to authenticated
using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false)
with check ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

create policy "profiles_permanent_users_only"
on public.profiles as restrictive
for all to authenticated
using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false)
with check ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

create policy "room_activities_permanent_users_only"
on public.room_activities as restrictive
for all to authenticated
using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false)
with check ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

create policy "room_participants_permanent_users_only"
on public.room_participants as restrictive
for all to authenticated
using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false)
with check ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

create policy "rooms_permanent_users_only"
on public.rooms as restrictive
for all to authenticated
using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false)
with check ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);
