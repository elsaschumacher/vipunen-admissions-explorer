// Build script: pull the Vipunen admissions dataset, aggregate it, and load it
// into Supabase. Run with `npm run build:db`. Re-run yearly when Vipunen updates.
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (service role bypasses
// RLS so it can write). Never expose the service key to the browser.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { aggregate, programId, majorName, type VipunenRow } from "./aggregate.ts";

config();

const DATASET = "korkeakoulutus_hakeneet_ja_paikan_vastaanottaneet";
const API = `https://api.vipunen.fi/api/resources/${DATASET}`;
const PAGE = 100_000;
const CACHE = ".vipunen-cache.json"; // local raw-data cache to avoid re-downloading

async function fetchAll(): Promise<VipunenRow[]> {
  if (existsSync(CACHE)) {
    console.log(`Using cached raw data (${CACHE}). Delete it to force re-download.`);
    return JSON.parse(readFileSync(CACHE, "utf8"));
  }
  const countRes = await fetch(`${API}/data/count`);
  const total = Number(await countRes.text());
  console.log(`Total rows to fetch: ${total}`);

  const all: VipunenRow[] = [];
  for (let offset = 0; offset < total; offset += PAGE) {
    const url = `${API}/data?limit=${PAGE}&offset=${offset}`;
    process.stdout.write(`  fetching offset ${offset}… `);
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} at offset ${offset}`);
    const page = (await res.json()) as VipunenRow[];
    all.push(...page);
    console.log(`got ${page.length} (total ${all.length})`);
  }
  writeFileSync(CACHE, JSON.stringify(all));
  return all;
}

function rawRowFor(r: VipunenRow) {
  if (!r.korkeakoulu || !r.paaasiallinenTutkintoHakukohde) return null;
  return {
    program_id: programId(r.korkeakoulu, r.tutkinnonAloitussykli, majorName(r.hakukohde, r.paaasiallinenTutkintoHakukohde)),
    year: r.koulutuksenAlkamisvuosi,
    kausi: r.koulutuksenAlkamiskausi,
    hakukohde: r.hakukohde,
    hakutapa: r.hakutapa,
    hakutyyppi: r.hakutyyppi,
    track: r.valintatapajononTyyppi,
    aloitussykli: r.tutkinnonAloitussykli,
    korkeakoulu: r.korkeakoulu,
    toimipiste: r.toimipiste,
    sektori: r.sektori,
    program: r.paaasiallinenTutkintoHakukohde,
    koulutusala: r.koulutusalaTaso1,
    ohjauksen_ala: r.okmOhjauksenAla,
    degree_level: r.koulutusasteTaso2,
    kieli: r.koulutuksenKieli,
    maakunta: r.maakuntaHakukohde,
    kunta: r.kuntaHakukohde,
    places: r.aloituspaikatLkm,
    applicants: r.kaikkiHakijatLkm,
    first_pref: r.ensisijaisetHakijatLkm,
    selected: r.valitutLkm,
    accepted: r.paikanVastaanottaneetLkm,
    started: r.aloittaneetLkm,
    min_score: r.alinHyvaksyttyPistemaara,
    max_score: r.ylinHyvaksyttyPistemaara,
  };
}

async function insertInBatches<T extends object>(
  db: SupabaseClient,
  table: string,
  rows: T[],
  mode: "insert" | "upsert",
  batchSize = 1000,
) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const q = mode === "upsert" ? db.from(table).upsert(batch) : db.from(table).insert(batch);
    const { error } = await q;
    if (error) throw new Error(`${table} ${mode} failed at ${i}: ${error.message}`);
    process.stdout.write(`\r  ${table}: ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
  }
  console.log("");
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const rows = await fetchAll();
  console.log(`Fetched ${rows.length} raw rows. Aggregating…`);
  const { programs, programYears, programTracks } = aggregate(rows);
  console.log(
    `Programs: ${programs.length}, program-years: ${programYears.length}, tracks: ${programTracks.length}`,
  );

  console.log("Clearing existing data…");
  // raw_rows/program_year/program_track cascade from program; clear children first
  for (const t of ["raw_rows", "program_track", "program_year", "program"]) {
    const { error } = await db.from(t).delete().neq("program_id", "__none__");
    if (error) throw new Error(`clearing ${t}: ${error.message}`);
  }

  console.log("Loading program…");
  await insertInBatches(db, "program", programs, "upsert");
  console.log("Loading program_year…");
  await insertInBatches(db, "program_year", programYears, "upsert");
  console.log("Loading program_track…");
  await insertInBatches(db, "program_track", programTracks, "upsert");

  console.log("Loading raw_rows…");
  const rawRows = rows.map(rawRowFor).filter((r): r is NonNullable<typeof r> => r !== null);
  await insertInBatches(db, "raw_rows", rawRows, "insert");

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
