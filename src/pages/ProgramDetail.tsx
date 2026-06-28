import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase.ts";
import type { Program, ProgramTrack, ProgramYear } from "../types.ts";
import StatCards from "../components/StatCards.tsx";
import TrendCharts from "../components/TrendCharts.tsx";
import TrackTable from "../components/TrackTable.tsx";

export default function ProgramDetail() {
  const { id } = useParams<{ id: string }>();
  const [program, setProgram] = useState<Program | null>(null);
  const [years, setYears] = useState<ProgramYear[]>([]);
  const [tracks, setTracks] = useState<ProgramTrack[]>([]);
  const [hakutapa, setHakutapa] = useState("Yhteishaku");
  const [year, setYear] = useState<number | null>(null);
  const [basis, setBasis] = useState<"all" | "first">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      const [p, py, pt] = await Promise.all([
        supabase.from("program").select("*").eq("program_id", id).single(),
        supabase.from("program_year").select("*").eq("program_id", id),
        supabase.from("program_track").select("*").eq("program_id", id),
      ]);
      if (cancelled) return;
      const err = p.error || py.error || pt.error;
      if (err) setError(err.message);
      else {
        setProgram(p.data as Program);
        setYears((py.data as ProgramYear[]) ?? []);
        setTracks((pt.data as ProgramTrack[]) ?? []);
      }
      setLoading(false);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Which application methods exist for this program (Yhteishaku / Erillishaku …).
  const hakutavat = useMemo(
    () => [...new Set(years.map((y) => y.hakutapa))].sort(),
    [years],
  );

  // Keep the selected hakutapa valid for this program.
  useEffect(() => {
    if (hakutavat.length && !hakutavat.includes(hakutapa)) setHakutapa(hakutavat[0]);
  }, [hakutavat, hakutapa]);

  const yearsForTapa = useMemo(
    () =>
      years
        .filter((y) => y.hakutapa === hakutapa)
        .sort((a, b) => b.year - a.year),
    [years, hakutapa],
  );
  // Default to the latest *complete* round (someone has accepted a place); the
  // current round is usually still in progress (accepted = 0, partial tracks).
  const defaultYear = useMemo(() => {
    const complete = yearsForTapa.find((y) => y.accepted > 0);
    return (complete ?? yearsForTapa[0])?.year ?? null;
  }, [yearsForTapa]);

  // Keep the selected year valid for the current hakutapa.
  useEffect(() => {
    if (defaultYear != null && !yearsForTapa.some((y) => y.year === year)) setYear(defaultYear);
  }, [defaultYear, yearsForTapa, year]);

  const selected = useMemo(
    () => yearsForTapa.find((y) => y.year === year) ?? null,
    [yearsForTapa, year],
  );
  const selectedTracks = useMemo(
    () =>
      selected
        ? tracks
            .filter((t) => t.hakutapa === hakutapa && t.year === selected.year)
            .sort((a, b) => b.selected - a.selected)
        : [],
    [tracks, hakutapa, selected],
  );
  const inProgress = selected != null && selected.accepted === 0 && selected.selected >= 0 && year === yearsForTapa[0]?.year;

  if (loading) return <div className="container"><p className="muted">Ladataan…</p></div>;
  if (error) return <div className="container"><p style={{ color: "salmon" }}>Virhe: {error}</p></div>;
  if (!program) return <div className="container"><p>Ohjelmaa ei löytynyt. <Link to="/">Takaisin</Link></p></div>;

  return (
    <div className="container">
      <p><Link to="/">← Haku</Link></p>
      <h1>
        {program.program}
        {program.entry_cycle && <span className="badge">{program.entry_cycle}</span>}
      </h1>
      <p className="muted">
        {program.korkeakoulu}
        {program.koulutusala ? ` · ${program.koulutusala}` : ""}
        {program.kunta ? ` · ${program.kunta}` : ""}
      </p>
      <p className="muted small">
        {program.degree_group && program.degree_group.toLowerCase() !== program.program.toLowerCase()
          ? `Tutkinto-ohjelma: ${program.degree_group}. `
          : ""}
        {program.degrees ? `Tutkinnot: ${program.degrees}` : ""}
      </p>
      <p className="small" style={{ margin: "8px 0" }}>
        {program.active ? (
          <span className="badge">Aktiivinen</span>
        ) : (
          <span className="badge badge-muted">
            Lakkautettu / nimi muuttunut (viimeksi {program.last_year})
          </span>
        )}
        {program.opintopolku_koulutus_oid ? (
          <a
            className="op-link"
            href={`https://opintopolku.fi/konfo/fi/koulutus/${program.opintopolku_koulutus_oid}`}
            target="_blank"
            rel="noreferrer"
          >
            Avaa Opintopolussa ↗
          </a>
        ) : (
          <a
            className="op-link"
            href={`https://opintopolku.fi/konfo/fi/haku/${encodeURIComponent(
              `${program.program} ${program.korkeakoulu}`,
            )}`}
            target="_blank"
            rel="noreferrer"
          >
            Hae Opintopolusta ↗
          </a>
        )}
      </p>

      {hakutavat.length > 1 && (
        <div className="toggle" style={{ margin: "12px 0" }}>
          {hakutavat.map((h) => (
            <button
              key={h}
              className={h === hakutapa ? "active" : ""}
              onClick={() => setHakutapa(h)}
            >
              {h}
            </button>
          ))}
        </div>
      )}

      <div className="toggle" style={{ margin: "12px 0" }}>
        <button className={basis === "all" ? "active" : ""} onClick={() => setBasis("all")}>
          Kaikki hakijat
        </button>
        <button className={basis === "first" ? "active" : ""} onClick={() => setBasis("first")}>
          Ensisijaiset hakijat
        </button>
      </div>

      {selected ? (
        <>
          <div className="year-row">
            <h2 style={{ margin: 0 }}>Tilastot</h2>
            <select value={year ?? ""} onChange={(e) => setYear(Number(e.target.value))}>
              {yearsForTapa.map((y) => (
                <option key={y.year} value={y.year}>
                  {y.year}
                  {y.accepted === 0 ? " (kesken)" : ""}
                </option>
              ))}
            </select>
          </div>
          {inProgress && (
            <p className="muted small">
              Vuoden {selected.year} valinta on vielä kesken — paikan
              vastaanottaneet ja lopulliset luvut puuttuvat.
            </p>
          )}
          <StatCards py={selected} basis={basis} />

          <h2>Kehitys vuosittain</h2>
          <TrendCharts years={yearsForTapa} basis={basis} />

          <h2>Valintatavat {selected.year}</h2>
          <TrackTable tracks={selectedTracks} />
        </>
      ) : (
        <p className="muted">Ei tilastoja valitulle hakutavalle.</p>
      )}

      <footer>
        Lähde: Opetushallinnon tilastopalvelu Vipunen (CC BY 4.0). Hakijaluvut on
        laskettu yhteen ohjelman hakukohteista, joten sama hakija voi näkyä useaan
        kertaan; hyväksymisprosentti on suuntaa-antava.
      </footer>
    </div>
  );
}
