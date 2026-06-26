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
    () => years.filter((y) => y.hakutapa === hakutapa),
    [years, hakutapa],
  );
  const latest = useMemo(
    () => yearsForTapa.reduce<ProgramYear | null>((a, b) => (!a || b.year > a.year ? b : a), null),
    [yearsForTapa],
  );
  const latestTracks = useMemo(
    () =>
      latest
        ? tracks
            .filter((t) => t.hakutapa === hakutapa && t.year === latest.year)
            .sort((a, b) => b.selected - a.selected)
        : [],
    [tracks, hakutapa, latest],
  );

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
      {program.degrees && (
        <p className="muted small">Tutkinnot: {program.degrees}</p>
      )}

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

      {latest ? (
        <>
          <h2>Tilastot {latest.year}</h2>
          <StatCards py={latest} />

          <h2>Kehitys vuosittain</h2>
          <TrendCharts years={yearsForTapa} />

          <h2>Valintatavat {latest.year}</h2>
          <TrackTable tracks={latestTracks} />
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
