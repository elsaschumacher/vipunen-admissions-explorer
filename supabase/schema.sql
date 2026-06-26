-- Vipunen Admissions Explorer — Supabase/Postgres schema
-- Run this once in the Supabase SQL editor (or via psql) before the first build.
-- Safe to re-run: drops and recreates the tables.

drop table if exists raw_rows cascade;
drop table if exists program_track cascade;
drop table if exists program_year cascade;
drop table if exists program cascade;

-- ── Dimension: one row per degree program (korkeakoulu + main degree) ──────────
create table program (
  program_id  text primary key,                 -- slug of korkeakoulu + paaasiallinenTutkintoHakukohde
  korkeakoulu text not null,
  sektori     text,                             -- Yliopistokoulutus / Ammattikorkeakoulukoulutus
  program     text not null,                    -- paaasiallinenTutkintoHakukohde (display name)
  koulutusala text,                             -- koulutusalaTaso1
  ohjauksen_ala text,                           -- okmOhjauksenAla
  degree_level text,                            -- koulutusasteTaso2
  maakunta    text,
  kunta       text,
  -- precomputed lowercase haystack for the search box
  search_text text generated always as (lower(coalesce(korkeakoulu,'') || ' ' || coalesce(program,''))) stored
);

-- ── Facts: one row per program × year × hakutapa (SUM-aggregated metrics) ──────
create table program_year (
  program_id text not null references program(program_id) on delete cascade,
  year       int  not null,
  hakutapa   text not null,                     -- Yhteishaku / Erillishaku
  places     int,                               -- SUM(aloituspaikatLkm)
  applicants int,                               -- SUM(kaikkiHakijatLkm)
  first_pref int,                               -- SUM(ensisijaisetHakijatLkm)
  selected   int,                               -- SUM(valitutLkm)
  accepted   int,                               -- SUM(paikanVastaanottaneetLkm)
  started    int,                               -- SUM(aloittaneetLkm)
  primary key (program_id, year, hakutapa)
);

-- ── Per selection-track detail (scores are NOT comparable across tracks) ───────
create table program_track (
  program_id text not null references program(program_id) on delete cascade,
  year       int  not null,
  hakutapa   text not null,
  track      text not null,                     -- valintatapajononTyyppi
  selected   int,
  accepted   int,
  min_score  numeric,                           -- MIN(alinHyvaksyttyPistemaara)
  max_score  numeric,                           -- MAX(ylinHyvaksyttyPistemaara)
  primary key (program_id, year, hakutapa, track)
);

-- ── Raw source rows kept verbatim for transparency / future re-aggregation ─────
create table raw_rows (
  id          bigint generated always as identity primary key,
  program_id  text,
  year        int,
  kausi       text,
  hakukohde   text,
  hakutapa    text,
  hakutyyppi  text,
  track       text,                             -- valintatapajononTyyppi
  korkeakoulu text,
  toimipiste  text,
  sektori     text,
  program     text,                             -- paaasiallinenTutkintoHakukohde
  koulutusala text,
  ohjauksen_ala text,
  degree_level text,
  kieli       text,
  maakunta    text,
  kunta       text,
  places      int,
  applicants  int,
  first_pref  int,
  selected    int,
  accepted    int,
  started     int,
  min_score   numeric,
  max_score   numeric
);

create index program_year_pid_year on program_year (program_id, year);
create index program_track_pid_year on program_track (program_id, year);
create index program_korkeakoulu on program (korkeakoulu);
create index program_search on program using gin (to_tsvector('simple', search_text));
create index raw_rows_pid on raw_rows (program_id, year);

-- ── Row Level Security: browser (anon) may read, never write ───────────────────
alter table program       enable row level security;
alter table program_year  enable row level security;
alter table program_track enable row level security;
alter table raw_rows      enable row level security;

create policy "anon read program"       on program       for select to anon using (true);
create policy "anon read program_year"  on program_year  for select to anon using (true);
create policy "anon read program_track" on program_track for select to anon using (true);
create policy "anon read raw_rows"      on raw_rows      for select to anon using (true);
-- No insert/update/delete policies → writes are denied for anon. The build
-- script uses the service-role key, which bypasses RLS.
