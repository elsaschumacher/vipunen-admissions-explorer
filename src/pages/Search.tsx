import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.ts";
import type { Program } from "../types.ts";

interface Facets {
  korkeakoulut: string[];
  koulutusalat: string[];
  maakunnat: string[];
}

export default function Search() {
  const [query, setQuery] = useState("");
  const [sektori, setSektori] = useState("");
  const [cycle, setCycle] = useState("");
  const [korkeakoulu, setKorkeakoulu] = useState("");
  const [koulutusala, setKoulutusala] = useState("");
  const [maakunta, setMaakunta] = useState("");
  const [showDiscontinued, setShowDiscontinued] = useState(false);
  const [results, setResults] = useState<Program[]>([]);
  const [facets, setFacets] = useState<Facets>({ korkeakoulut: [], koulutusalat: [], maakunnat: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce the query so we don't hit the DB on every keystroke.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Load filter options (distinct values) once, scoped to the active/all set.
  useEffect(() => {
    let cancelled = false;
    async function loadFacets() {
      // Page through all rows so the option lists are complete (avoids row caps).
      type Row = { korkeakoulu: string; koulutusala: string | null; maakunta: string | null };
      const all: Row[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        let q = supabase
          .from("program")
          .select("korkeakoulu,koulutusala,maakunta")
          .range(from, from + PAGE - 1);
        if (!showDiscontinued) q = q.eq("active", true);
        const { data } = await q;
        if (!data || data.length === 0) break;
        all.push(...(data as Row[]));
        if (data.length < PAGE) break;
      }
      if (cancelled) return;
      const uniq = (key: keyof Row) =>
        [...new Set(all.map((r) => r[key]).filter(Boolean) as string[])].sort((a, b) =>
          a.localeCompare(b, "fi"),
        );
      setFacets({
        korkeakoulut: uniq("korkeakoulu"),
        koulutusalat: uniq("koulutusala"),
        maakunnat: uniq("maakunta"),
      });
    }
    loadFacets();
    return () => {
      cancelled = true;
    };
  }, [showDiscontinued]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      let q = supabase
        .from("program")
        .select(
          "program_id,korkeakoulu,sektori,program,koulutusala,degree_group,entry_cycle,cycle_code,degrees,active,last_year",
        )
        .order("korkeakoulu")
        .order("program")
        .limit(300);
      if (debounced) q = q.ilike("search_text", `%${debounced.toLowerCase()}%`);
      if (sektori) q = q.eq("sektori", sektori);
      if (cycle) q = q.eq("cycle_code", cycle);
      if (korkeakoulu) q = q.eq("korkeakoulu", korkeakoulu);
      if (koulutusala) q = q.eq("koulutusala", koulutusala);
      if (maakunta) q = q.eq("maakunta", maakunta);
      if (!showDiscontinued) q = q.eq("active", true);
      const { data, error } = await q;
      if (cancelled) return;
      if (error) setError(error.message);
      else setResults((data as Program[]) ?? []);
      setLoading(false);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [debounced, sektori, cycle, korkeakoulu, koulutusala, maakunta, showDiscontinued]);

  // Group results by institution (only show a heading when there are several).
  const groups = useMemo(() => {
    const m = new Map<string, Program[]>();
    for (const p of results) {
      const list = m.get(p.korkeakoulu) ?? [];
      list.push(p);
      m.set(p.korkeakoulu, list);
    }
    return [...m.entries()];
  }, [results]);

  const hasNoFilter = !debounced && !sektori && !cycle && !korkeakoulu && !koulutusala && !maakunta;

  return (
    <div className="container">
      <h1>Korkeakouluun hyväksytyt</h1>
      <p className="muted">
        Hae koulutusta (esim. "tietotekniikka") ja katso hakija- ja
        valintatilastot vuosittain.
      </p>

      <input
        className="search-input"
        placeholder="Hae korkeakoulu tai koulutus…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className="filters">
        <select value={korkeakoulu} onChange={(e) => setKorkeakoulu(e.target.value)}>
          <option value="">Kaikki korkeakoulut</option>
          {facets.korkeakoulut.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select value={koulutusala} onChange={(e) => setKoulutusala(e.target.value)}>
          <option value="">Kaikki koulutusalat</option>
          {facets.koulutusalat.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select value={maakunta} onChange={(e) => setMaakunta(e.target.value)}>
          <option value="">Koko Suomi</option>
          {facets.maakunnat.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select value={sektori} onChange={(e) => setSektori(e.target.value)}>
          <option value="">Kaikki sektorit</option>
          <option value="Yliopistokoulutus">Yliopisto</option>
          <option value="Ammattikorkeakoulukoulutus">Ammattikorkeakoulu</option>
        </select>
        <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
          <option value="">Kaikki hakutyypit</option>
          <option value="i">Suora haku (kandi/perustutkinto)</option>
          <option value="ii">Maisterihaku</option>
          <option value="iii">Tohtorikoulutus</option>
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={showDiscontinued}
            onChange={(e) => setShowDiscontinued(e.target.checked)}
          />
          Näytä myös lakkautetut
        </label>
      </div>

      {error && <p style={{ color: "salmon" }}>Virhe: {error}</p>}
      {loading && <p className="muted">Ladataan…</p>}
      {!loading && (
        <p className="muted small">
          {hasNoFilter
            ? `Näytetään ${results.length} koulutusta. Hae tai rajaa suodattimilla.`
            : `${results.length} tulosta`}
        </p>
      )}

      {!loading &&
        groups.map(([uni, progs]) => (
          <div key={uni} className="uni-group">
            {groups.length > 1 && (
              <div className="uni-header">
                {uni} <span className="muted small">({progs.length})</span>
              </div>
            )}
            {progs.map((p) => (
              <Link className="result" key={p.program_id} to={`/program/${p.program_id}`}>
                <div>
                  {p.program}
                  {p.entry_cycle && <span className="badge">{p.entry_cycle}</span>}
                  {!p.active && (
                    <span className="badge badge-muted">Lakkautettu (viim. {p.last_year})</span>
                  )}
                </div>
                <div className="inst">
                  {groups.length > 1 ? "" : `${p.korkeakoulu} · `}
                  {p.koulutusala ?? ""}
                  {p.degree_group && p.degree_group.toLowerCase() !== p.program.toLowerCase()
                    ? ` · ${p.degree_group}`
                    : ""}
                </div>
              </Link>
            ))}
          </div>
        ))}
      {!loading && !error && results.length === 0 && <p className="muted">Ei tuloksia.</p>}

      <footer>Lähde: Opetushallinnon tilastopalvelu Vipunen (CC BY 4.0).</footer>
    </div>
  );
}
