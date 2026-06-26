# Vipunen Admissions Explorer

Browse Finnish higher-education admission statistics per **degree program**
(e.g. *Aalto-yliopisto — Dipl.ins., tietotekniikka*): applicants, places, admit
rate, accepted, and per-selection-track score thresholds, with year-by-year trends.

Data: [Vipunen](https://vipunen.fi) open dataset
`korkeakoulutus_hakeneet_ja_paikan_vastaanottaneet` (CC BY 4.0). React + TypeScript
front end reads directly from a free Supabase Postgres — no custom backend.

## Setup

### 1. Install
```bash
npm install
```

### 2. Create a Supabase project
1. Sign up at https://supabase.com (free tier, no card) and create a project.
2. In the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql).
3. From Project Settings → API, copy the **Project URL**, the **anon public** key,
   and the **service_role** secret key.

### 3. Configure env
```bash
cp .env.example .env
# fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (client),
# and SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (build script only)
```

### 4. Load the data
```bash
npm run build:db
```
This downloads ~330 MB from Vipunen (cached locally in `.vipunen-cache.json` so
re-runs are fast), aggregates it, and loads `program`, `program_year`,
`program_track`, and `raw_rows`. Re-run yearly when Vipunen updates; delete
`.vipunen-cache.json` first to force a fresh download.

### 5. Run the app
```bash
npm run dev
```

## How the data is aggregated

Each application target (`hakukohde`) is split in the source into multiple rows by
selection track (`valintatapajononTyyppi`), with metrics on different rows
(places on the null-track row, applicants on the `Ei valittu` row, selected/scores
on named-track rows). The build sums each metric across those rows per
program × year × hakutapa. Scores are kept **per track** because the point scales
differ between tracks. See [`build/aggregate.ts`](build/aggregate.ts) and its tests.

```bash
npm test   # verifies the aggregation rules
```

## Project layout
- `build/aggregate.ts` — pure aggregation logic (unit tested)
- `build/buildDb.ts` — fetch + load pipeline
- `supabase/schema.sql` — tables, indexes, RLS (anon read-only)
- `src/pages/Search.tsx` — search / browse
- `src/pages/ProgramDetail.tsx` — per-program stats + trends
- `src/components/` — StatCards, TrendCharts, TrackTable
