## Problem

1. The inicio welcome message currently hardcodes "¡Bienvenida, {nombre}!". It needs to be inclusive: **"Bienvenid@, {nombre}"**.
2. The admin inicio editor only accepts a pasted video URL (YouTube/MP4). It needs a **direct file upload to Bunny Stream** using the existing Bunny infrastructure, with encoding progress tracking and iframe playback.

## Technical Plan

### 1. Inclusive Welcome Message (tiny fix)
- In `src/routes/_authenticated/inicio.tsx`, replace the hardcoded greeting:
  - Change `¡Bienvenida{nombrePila ? \`, \${nombrePila}\` : ""}!` → `Bienvenid@ {nombrePila}`
- The `@` is part of the inclusive word, not a template placeholder.

### 2. Bunny Stream Video Upload for Inicio
We reuse the exact same pattern already working for course lessons:

**Server layer** — use existing `src/lib/bunny.functions.ts`:
- `createBunnyVideoForUpload` — creates a Bunny video record + TUS signature.
- `getBunnyVideoStatus` — polls encoding progress.
- `deleteBunnyVideo` — cleans up if replaced.

**Client layer** — adapt the cursos upload UI into the `/inicio` admin editor:
- Add state: `bunnyCfg` (public config from `getBunnyPublicConfig`), `uploadProgress`, `videoStatus`.
- Replace the plain `<input>` for video URL with a file `<input type="file" accept="video/*">`.
- On file select:
  1. Call `createBunnyVideoForUpload({ data: { title: 'Video de bienvenida' } })`.
  2. Use `tus-js-client` (already installed for cursos) to upload directly to `https://video.bunnycdn.com/tusupload`.
  3. Track progress via tus `onProgress`.
  4. On success, save the Bunny `videoId` (GUID) into `app_config.inicio_video_url` via Supabase update.
- On load:
  - Detect if `inicio_video_url` is a Bunny GUID (`/^[0-9a-f-]{20,}$/i`).
  - Show `iframe.mediadelivery.net/embed/{libraryId}/{videoId}` using `bunnyCfg`.
  - Poll `getBunnyVideoStatus` if encoding is in progress and show a progress bar.
- Keep backwards compatibility: if the stored URL is a YouTube link or plain MP4 URL, render it as before.
- Allow admin to delete/replace the video (calls `deleteBunnyVideo` and clears the field).

**Schema** — no migration needed: `app_config.inicio_video_url` already stores strings (URL or Bunny GUID). The detection happens in the frontend via regex.

## No-Go / Already Done
- No new database tables or columns required.
- No new Bunny secrets required — they are already configured.
- The `sendPushToUsers` and Zoom webhook fixes from the previous round are already done and verified.