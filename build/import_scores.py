#!/usr/bin/env python3
"""Import admission point limits (pisterajat) into program_admission_score.

Source: the Vipunen "Korkeakoulujen yhteishaku - pisterajat" Excel, exported with
the valintatapajono rows EXPANDED (institution -> hakukohde -> jono). Place the
file at data/pisterajat-<year>.xlsb.

Run:  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python3 build/import_scores.py [year]

Matches each hakukohde to a program via the same major/route normalisation used
in build/aggregate.ts, then upserts per-jono min/max scores.
"""
import os, re, sys, json, urllib.request, collections
from pyxlsb import open_workbook

YEAR = int(sys.argv[1]) if len(sys.argv) > 1 else 2025
XLSB = os.path.join(os.path.dirname(__file__), "..", "data", f"pisterajat-{YEAR}.xlsb")
URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Keep in sync with majorName()/ROUTE_PREFIXES in build/aggregate.ts
ROUTE = ["haku ", "päähaku", "huvudansökan", "gemensam ansökan", "double degree",
         "siirtohaku", "transfer application", "separate application", "master's admission",
         "maisterihaku", "tohtorihaku", "kandidaattihaku", "lisähaku", "magisterantagning",
         "avoimen yliopiston väylä", "avoimen ammattikorkeakoulun väylä", "avoimen amk",
         "avoimen väylä", "avoin väylä", "öppna universitetsleden",
         "öppna yrkeshögskoleleden", "öppna yh", "öppna leden"]

def major(hk: str):
    s = hk; low = s.lower()
    if any(low.startswith(p) for p in ROUTE):
        seps = [i for i in (s.find(","), s.find(":")) if i > 0]
        if not seps:
            return None
        s = s[min(seps) + 1:]
    if ";" in s:
        s = s[s.rindex(";") + 1:]
    segs = [x.strip() for x in s.split(",")]
    f = segs[1] if re.search(r"\((ylempi\s+)?(amk|yamk)\)", segs[0], re.I) and len(segs) > 1 else segs[0]
    return re.sub(r"\s*\([^)]*\)", "", f).strip().lower()

def cycle_hint(hk: str):
    """Infer Bologna cycle from the hakukohde text to disambiguate matches."""
    low = hk.lower()
    if low.startswith(("maisterihaku", "master's admission", "magisterantagning")) or "magister" in low:
        return "ii"
    if "tohtori" in low or "doctoral" in low:
        return "iii"
    return "i"  # bachelor / combined is the default for pisterajat

def parse_rows():
    wb = open_workbook(XLSB)
    with wb.get_sheet("Taulukko") as sh:
        rows = [[c.v for c in r] for r in sh.rows()]
    recs = []; inst = None; hk = None
    for r in rows[23:]:
        c1 = r[1] if len(r) > 1 else None
        c2 = r[2] if len(r) > 2 else None
        c3 = r[3] if len(r) > 3 else None
        if not c1:
            continue
        num = lambda v: v if isinstance(v, (int, float)) else None
        if isinstance(c2, (int, float)) or isinstance(c3, (int, float)) or c2 == "−" or c3 == "−":
            recs.append((inst, hk, str(c1).strip(), num(c2), num(c3)))  # jono row
        else:
            t = str(c1)
            if ("," in t) or ("(" in t):
                hk = t
            else:
                inst = t; hk = None
    return recs

def fetch_programs():
    progs = collections.defaultdict(list)
    frm = 0
    while True:
        req = urllib.request.Request(
            f"{URL}/rest/v1/program?select=program_id,korkeakoulu,field,cycle_code",
            headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Range": f"{frm}-{frm+999}"})
        pg = json.load(urllib.request.urlopen(req))
        for p in pg:
            progs[(p["korkeakoulu"], p["field"])].append((p["cycle_code"], p["program_id"]))
        if len(pg) < 1000:
            break
        frm += 1000
    return progs

def match(progs, inst, hk):
    m = major(hk) if hk else None
    if not m:
        return None
    opts = progs.get((inst, m))
    if not opts:
        return None
    want = cycle_hint(hk)
    for cc, pid in opts:
        if cc == want:
            return pid
    for cc, pid in opts:        # fall back to bachelor, then anything
        if cc == "i":
            return pid
    return opts[0][1]

def main():
    recs = parse_rows()
    progs = fetch_programs()
    # aggregate per (program_id, jono): min of mins, max of maxes
    agg = {}
    unmatched = collections.Counter()
    for inst, hk, jono, lo, hi in recs:
        if lo is None and hi is None:
            continue
        pid = match(progs, inst, hk)
        if not pid:
            unmatched[(inst, major(hk) if hk else hk)] += 1
            continue
        k = (pid, jono)
        cur = agg.get(k)
        nlo = lo if cur is None or cur[0] is None else (lo if lo is not None and lo < cur[0] else cur[0])
        nhi = hi if cur is None or cur[1] is None else (hi if hi is not None and hi > cur[1] else cur[1])
        agg[k] = (nlo, nhi)
    payload = [{"program_id": pid, "year": YEAR, "jono": jono,
                "min_score": round(lo, 2) if lo is not None else None,
                "max_score": round(hi, 2) if hi is not None else None}
               for (pid, jono), (lo, hi) in agg.items()]
    print(f"parsed {len(recs)} jono rows; matched into {len(payload)} (program,jono) scores; "
          f"unmatched hakukohde-groups: {len(unmatched)}")

    # clear this year's rows, then insert in batches
    req = urllib.request.Request(
        f"{URL}/rest/v1/program_admission_score?year=eq.{YEAR}",
        method="DELETE", headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    urllib.request.urlopen(req)
    for i in range(0, len(payload), 500):
        batch = payload[i:i+500]
        body = json.dumps(batch).encode()
        req = urllib.request.Request(
            f"{URL}/rest/v1/program_admission_score", data=body, method="POST",
            headers={"apikey": KEY, "Authorization": f"Bearer {KEY}",
                     "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"})
        urllib.request.urlopen(req)
        print(f"  inserted {min(i+500, len(payload))}/{len(payload)}")
    print("done.")

if __name__ == "__main__":
    main()
