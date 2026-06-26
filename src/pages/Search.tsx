import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.ts";
import type { Program } from "../types.ts";

export default function Search() {
  const [query, setQuery] = useState("");
  const [sektori, setSektori] = useState("");
  const [results, setResults] = useState<Program[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce the query so we don't hit the DB on every keystroke.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      let q = supabase
        .from("program")
        .select("program_id,korkeakoulu,sektori,program,koulutusala,degree_level")
        .order("korkeakoulu")
        .limit(100);
      if (debounced) q = q.ilike("search_text", `%${debounced.toLowerCase()}%`);
      if (sektori) q = q.eq("sektori", sektori);
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
  }, [debounced, sektori]);

  const hint = useMemo(
    () => (!debounced && !sektori ? "Showing first 100 programs. Start typing to search." : null),
    [debounced, sektori],
  );

  return (
    <div className="container">
      <h1>Korkeakouluun hyväksytyt</h1>
      <p className="muted">
        Hae koulutusohjelmaa (esim. "Aalto tietotekniikka") ja katso hakija- ja
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
        <select value={sektori} onChange={(e) => setSektori(e.target.value)}>
          <option value="">Kaikki sektorit</option>
          <option value="Yliopistokoulutus">Yliopisto</option>
          <option value="Ammattikorkeakoulukoulutus">Ammattikorkeakoulu</option>
        </select>
      </div>

      {error && <p style={{ color: "salmon" }}>Virhe: {error}</p>}
      {loading && <p className="muted">Ladataan…</p>}
      {hint && <p className="muted small">{hint}</p>}

      {!loading &&
        results.map((p) => (
          <Link className="result" key={p.program_id} to={`/program/${p.program_id}`}>
            <div>{p.program}</div>
            <div className="inst">
              {p.korkeakoulu}
              {p.koulutusala ? ` · ${p.koulutusala}` : ""}
            </div>
          </Link>
        ))}
      {!loading && !error && results.length === 0 && (
        <p className="muted">Ei tuloksia.</p>
      )}

      <footer>
        Lähde: Opetushallinnon tilastopalvelu Vipunen (CC BY 4.0).
      </footer>
    </div>
  );
}
