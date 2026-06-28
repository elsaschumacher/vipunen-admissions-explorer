import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.ts";

interface Row {
  min_score: number | null;
  max_score: number | null;
  jono: string;
  program: {
    program_id: string;
    program: string;
    korkeakoulu: string;
    koulutusala: string | null;
    sektori: string | null;
  };
}

const SELECT =
  "min_score,max_score,jono,program!inner(program_id,program,korkeakoulu,koulutusala,sektori,active)";

export default function ScoreChecker() {
  const [points, setPoints] = useState("");
  const [koulutusala, setKoulutusala] = useState("");
  const [sektori, setSektori] = useState("");
  const [firstTimer, setFirstTimer] = useState(false);
  const [alat, setAlat] = useState<string[]>([]);
  const [clears, setClears] = useState<Row[]>([]);
  const [near, setNear] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // field options (todistus programs only)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("program")
        .select("koulutusala")
        .eq("active", true)
        .not("koulutusala", "is", null);
      const set = [...new Set((data ?? []).map((r) => r.koulutusala as string))].sort((a, b) =>
        a.localeCompare(b, "fi"),
      );
      setAlat(set);
    })();
  }, []);

  const p = Number(points.replace(",", "."));
  const valid = points !== "" && !Number.isNaN(p);

  useEffect(() => {
    if (!valid) {
      setClears([]);
      setNear([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const base = () => {
        let q = supabase
          .from("program_admission_score")
          .select(SELECT)
          .eq("year", 2025)
          .ilike("jono", "%todistus%")
          .eq("program.active", true);
        // first-timer quota vs everyone
        q = firstTimer
          ? q.ilike("jono", "%ensikertalaisille%")
          : q.not("jono", "ilike", "%ensikertalaisille%");
        if (koulutusala) q = q.eq("program.koulutusala", koulutusala);
        if (sektori) q = q.eq("program.sektori", sektori);
        return q;
      };
      const [cl, nr] = await Promise.all([
        base().lte("min_score", p).order("min_score", { ascending: false }).limit(300),
        base().gt("min_score", p).lte("min_score", p + 15).order("min_score").limit(40),
      ]);
      if (cancelled) return;
      if (cl.error || nr.error) setError((cl.error || nr.error)!.message);
      else {
        setClears((cl.data as unknown as Row[]) ?? []);
        setNear((nr.data as unknown as Row[]) ?? []);
      }
      setLoading(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [valid, p, koulutusala, sektori, firstTimer]);

  // group clears by field when no field filter (different scales → separate visually)
  const grouped = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of clears) {
      const k = r.program.koulutusala ?? "Muu";
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "fi"));
  }, [clears]);

  return (
    <div className="container">
      <p><Link to="/">← Haku</Link></p>
      <h1>Mihin pääsisit?</h1>
      <p className="muted">
        Syötä todistusvalintapisteesi ja katso, minkä koulutusten alimman
        hyväksytyn pisterajan olisit ylittänyt (kevään 2025 yhteishaku).
      </p>

      <div className="filters" style={{ alignItems: "center" }}>
        <input
          className="search-input"
          style={{ maxWidth: 160 }}
          inputMode="decimal"
          placeholder="Pisteesi"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          autoFocus
        />
        <select value={koulutusala} onChange={(e) => setKoulutusala(e.target.value)}>
          <option value="">Kaikki koulutusalat</option>
          {alat.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select value={sektori} onChange={(e) => setSektori(e.target.value)}>
          <option value="">Yliopisto + AMK</option>
          <option value="Yliopistokoulutus">Yliopisto</option>
          <option value="Ammattikorkeakoulukoulutus">Ammattikorkeakoulu</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={firstTimer} onChange={(e) => setFirstTimer(e.target.checked)} />
          Olen ensikertalainen
        </label>
      </div>

      <p className="muted small" style={{ background: "var(--panel-2)", padding: "10px 12px", borderRadius: 8 }}>
        ⚠️ Todistusvalintapisteet lasketaan <b>alakohtaisilla malleilla</b> — esim. DIA-,
        kauppatieteiden- ja lääketieteen pisteet eivät ole vertailukelpoisia keskenään.
        Valitse oma alasi, jotta vertailu on mielekäs. Perustuu vuoden 2025 pisterajoihin
        eikä takaa paikkaa.
      </p>

      {error && <p style={{ color: "salmon" }}>Virhe: {error}</p>}
      {valid && loading && <p className="muted">Lasketaan…</p>}

      {valid && !loading && (
        <>
          <h2>Ylität pisterajan ({clears.length})</h2>
          {clears.length === 0 && <p className="muted">Ei osumia näillä rajauksilla.</p>}
          {grouped.map(([ala, rows]) => (
            <div key={ala} className="uni-group">
              {!koulutusala && grouped.length > 1 && (
                <div className="uni-header">{ala} <span className="muted small">({rows.length})</span></div>
              )}
              {rows.map((r) => (
                <Link className="result" key={r.program.program_id + r.jono} to={`/program/${r.program.program_id}`}>
                  <div>
                    {r.program.program}
                    <span className="badge">+{(p - (r.min_score ?? 0)).toLocaleString("fi-FI", { maximumFractionDigits: 1 })}</span>
                  </div>
                  <div className="inst">
                    {r.program.korkeakoulu} · alin {r.min_score?.toLocaleString("fi-FI", { maximumFractionDigits: 2 })}
                  </div>
                </Link>
              ))}
            </div>
          ))}

          {near.length > 0 && (
            <>
              <h2>Juuri ja juuri jäi (–15 p)</h2>
              {near.map((r) => (
                <Link className="result" key={r.program.program_id + r.jono} to={`/program/${r.program.program_id}`}>
                  <div>
                    {r.program.program}
                    <span className="badge badge-muted">
                      −{((r.min_score ?? 0) - p).toLocaleString("fi-FI", { maximumFractionDigits: 1 })}
                    </span>
                  </div>
                  <div className="inst">
                    {r.program.korkeakoulu} · alin {r.min_score?.toLocaleString("fi-FI", { maximumFractionDigits: 2 })}
                  </div>
                </Link>
              ))}
            </>
          )}
        </>
      )}

      <footer>Lähde: Vipunen, korkeakoulujen yhteishaun pisterajat 2025 (CC BY 4.0).</footer>
    </div>
  );
}
