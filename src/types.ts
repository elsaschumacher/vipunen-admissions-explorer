export interface Program {
  program_id: string;
  korkeakoulu: string;
  sektori: string | null;
  program: string;
  field: string | null;
  degree_group: string | null;
  entry_cycle: string | null;
  cycle_code: string | null;
  degrees: string | null;
  first_year: number | null;
  last_year: number | null;
  active: boolean;
  opintopolku_oid: string | null;
  opintopolku_koulutus_oid: string | null;
  koulutusala: string | null;
  ohjauksen_ala: string | null;
  maakunta: string | null;
  kunta: string | null;
}

export interface ProgramYear {
  program_id: string;
  year: number;
  hakutapa: string;
  places: number;
  applicants: number;
  first_pref: number;
  selected: number;
  accepted: number;
  started: number;
}

export interface ProgramTrack {
  program_id: string;
  year: number;
  hakutapa: string;
  track: string;
  selected: number;
  accepted: number;
  min_score: number | null;
  max_score: number | null;
}
