# Project rules

- Shared reads (community, general channel, courses, availability, app config, points) use `public.es_miembro_activo()` in RLS, never `true` or `auth.uid() IS NOT NULL` — inactive or pending accounts must be blocked in the database, not only in the UI.
- Public storage buckets (avatars, course-covers) have no open SELECT policy; files are served through public URLs, and listing is limited to the owner's folder or staff.
