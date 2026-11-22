/**
 * Demo data: 30 days of closed history (drives the dashboard and hotspots) plus
 * a hand-written set of live cases covering every lifecycle state. Times are
 * relative to the moment the store is first created or reset.
 */
import { suggest } from "@/lib/classifier";
import { CORPUS } from "@/lib/corpus";
import { DAY, HOUR, MIN, fmtDate } from "@/lib/format";
import { THESIS_HOTSPOTS, landmarkById, purokAt, purokCenter, type LatLon } from "@/lib/geo";
import { CATEGORY, CATEGORY_TEAM } from "@/lib/domain";
import { addDays, manilaDate, slotAt } from "@/lib/duty";
import type {
  AuditEntry,
  CaseEvent,
  Category,
  Channel,
  DB,
  DutyShift,
  FieldAssignment,
  KpCase,
  LocationInfo,
  NotificationType,
  Resident,
  ResidentNotification,
  ServiceRequest,
  Settings,
  Shift,
  SmsMessage,
  Staff,
  Status,
  Team,
  Urgency,
} from "@/lib/domain";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TEAMS: Team[] = [
  { id: "t_peace", name: "Peace & Order (Tanod)", category: "peace" },
  { id: "t_works", name: "Public Works", category: "infra" },
  { id: "t_health", name: "Health & Sanitation", category: "sanitation" },
  { id: "t_records", name: "Records Desk", category: "documents" },
  { id: "t_social", name: "Social Services", category: "social" },
];

const STAFF: Staff[] = [
  { id: "s_jessa", name: "Jessa Villanueva", title: "Barangay Secretary", role: "intake", team: null, email: "jessa@sampaguita.gov.ph", active: true },
  { id: "s_arnel", name: "Arnel Cruz", title: "Chief Tanod", role: "handler", team: "t_peace", email: "arnel@sampaguita.gov.ph", active: true },
  { id: "s_mario", name: "Mario Bautista", title: "Maintenance Lead", role: "handler", team: "t_works", email: "mario@sampaguita.gov.ph", active: true },
  { id: "s_grace", name: "Grace Lim", title: "Barangay Health Worker", role: "handler", team: "t_health", email: "grace@sampaguita.gov.ph", active: true },
  { id: "s_lorna", name: "Lorna Pascual", title: "Records Clerk", role: "handler", team: "t_records", email: "lorna@sampaguita.gov.ph", active: true },
  { id: "s_rhea", name: "Rhea Domingo", title: "Social Welfare Desk", role: "handler", team: "t_social", email: "rhea@sampaguita.gov.ph", active: true },
  { id: "s_ramon", name: "Kgwd. Ramon Dizon", title: "Committee Chair, Operations", role: "supervisor", team: null, email: "ramon@sampaguita.gov.ph", active: true },
  { id: "s_paolo", name: "Paolo Reyes", title: "Systems Administrator", role: "admin", team: null, email: "paolo@sampaguita.gov.ph", active: true },
  { id: "s_joel", name: "Joel Fernandez", title: "Barangay Tanod", role: "tanod", team: "t_peace", email: "", active: true, phone: "09195550103", zone: "P4" },
  { id: "s_ben", name: "Benjamin Soriano", title: "Barangay Tanod", role: "tanod", team: "t_peace", email: "", active: true, phone: "09175550142", zone: "P1" },
  { id: "s_rico", name: "Rico Manalo", title: "Barangay Tanod", role: "tanod", team: "t_peace", email: "", active: true, phone: "09185550177", zone: "P3" },
  { id: "s_edwin", name: "Edwin Galang", title: "Barangay Tanod", role: "tanod", team: "t_peace", email: "", active: true, phone: "09205550168", zone: "P5" },
  { id: "s_nestor", name: "Nestor Aquino", title: "Barangay Tanod", role: "tanod", team: "t_peace", email: "", active: true, phone: "09215550129", zone: "P2" },
];

/**
 * One week back to three weeks ahead: two day and two night regulars, a reliever
 * alternating shifts, and one rest day a week each (offset so coverage never drops to zero).
 */
function buildRoster(now: number): DutyShift[] {
  const regulars: [string, Shift, number][] = [
    ["s_ben", "day", 2],
    ["s_rico", "day", 3],
    ["s_joel", "night", 5],
    ["s_edwin", "night", 1],
  ];
  const first = addDays(manilaDate(now), -7);
  const out: DutyShift[] = [];
  for (let i = 0; i < 29; i++) {
    const date = addDays(first, i);
    const slots: [string, Shift][] = regulars.filter(([, , rest]) => (i + rest) % 7 !== 0).map(([id, shift]) => [id, shift]);
    slots.push(["s_nestor", i % 2 ? "day" : "night"]);
    for (const [tanodId, shift] of slots) out.push({ id: `d_${date}_${shift}_${tanodId}`, tanodId, date, shift });
  }
  return out;
}

const HANDLER_FOR: Record<string, string> = { t_peace: "s_arnel", t_works: "s_mario", t_health: "s_grace", t_records: "s_lorna", t_social: "s_rhea" };

const RESIDENTS: Resident[] = [
  { id: "r_liza", name: "Liza Ramos", email: "liza.ramos@example.com", purok: "P3", lang: "fil", emailUpdates: true, phone: "09171234567", smsUpdates: true },
  { id: "r_jun", name: "Jun Mercado", email: "jun.mercado@example.com", purok: "P1", lang: "fil", emailUpdates: false, phone: "09281234500", smsUpdates: false },
  { id: "r_carmela", name: "Carmela Ocampo", email: "carmela.o@example.com", purok: "P4", lang: "fil", emailUpdates: true, phone: "09175550111", smsUpdates: true },
  { id: "r_benjie", name: "Benjie Navarro", email: "benjie.n@example.com", purok: "P3", lang: "en", emailUpdates: true, phone: null, smsUpdates: false },
  { id: "r_aileen", name: "Aileen Robles", email: "aileen.r@example.com", purok: "P2", lang: "fil", emailUpdates: false, phone: "09189990022", smsUpdates: true },
  { id: "r_dennis", name: "Dennis Yap", email: "dennis.yap@example.com", purok: "P1", lang: "en", emailUpdates: true, phone: null, smsUpdates: false },
];

export const SETTINGS: Settings = {
  barangay: "Barangay Sampaguita",
  city: "Muntinlupa City",
  officeHours: "Mon–Sat · 8:00 AM – 5:00 PM",
  intakeHours: "Intake inbox monitored daily, 7:00 AM – 9:00 PM",
  hotline: "(02) 8000-0000",
  emergency: "911",
  targets: { high: 2, medium: 24, normal: 72 },
  hotspot: { epsM: 100, minPts: 4, days: 30 },
  referrals: [
    { id: "ref_eng", name: "City Engineering Department", scope: "Roads, drainage, structures beyond barangay capacity", contact: "Local 2210" },
    { id: "ref_power", name: "Electric utility hotline", scope: "Live wires, transformers, power poles", contact: "16211" },
    { id: "ref_cho", name: "City Health Office", scope: "Disease outbreaks, rabies exposure, sanitation permits", contact: "Local 2302" },
    { id: "ref_cswd", name: "City Social Welfare & Development", scope: "Cash aid, PWD and senior programs, crisis intervention", contact: "Local 2405" },
    { id: "ref_pnp", name: "Muntinlupa City Police Station", scope: "Crimes in progress, weapons, VAWC complaints", contact: "911 / (02) 8862-2611" },
    { id: "ref_lupon", name: "Lupon Tagapamayapa", scope: "Neighbor disputes for barangay mediation", contact: "Barangay Hall, Room 2" },
  ],
  privacy: {
    retentionMonths: 24,
    dpo: { name: "Atty. Marites Lacson", email: "dpo@sampaguita.gov.ph", phone: "(02) 8000-0000 loc. 12" },
    lastRetentionRun: null,
  },
};

const OUTCOME: Record<Category, string> = {
  peace: "Pinuntahan ng tanod at kinausap ang mga sangkot. Babantayan ang lugar ngayong linggo.",
  infra: "Naayos na ng Public Works team. Salamat sa pag-ulat.",
  sanitation: "Nalinis at nakolekta na. Naka-schedule na ang regular na pagdaan ng truck.",
  documents: "Naibigay na ang listahan ng requirements. Maaari nang kunin sa Barangay Hall.",
  social: "Na-assess ng Social Services at naibigay ang tulong o referral.",
};

const staffName = (id: string) => STAFF.find((s) => s.id === id)!.name;

interface Draft {
  text: string;
  category: Category;
  urgency: Urgency;
  createdAt: number;
  status: Status;
  residentId: string | null;
  channel?: Channel;
  contact?: ServiceRequest["contact"];
  location: LocationInfo | null;
  dangerNow?: boolean;
  residentCategory?: Category | null;
  restricted?: boolean;
  triaged?: boolean;
  assigneeId?: string | null;
  events?: (seed: ServiceRequest) => CaseEvent[];
  extra?: Partial<ServiceRequest>;
}

let eventSeq = 0;
function ev(at: number, type: CaseEvent["type"], vis: CaseEvent["vis"], actor: CaseEvent["actor"], text?: string, meta?: CaseEvent["meta"]): CaseEvent {
  return { id: `e_${(++eventSeq).toString(36)}`, at, type, vis, actor, ...(text ? { text } : {}), ...(meta ? { meta } : {}) };
}
const staffActor = (id: string): CaseEvent["actor"] => ({ kind: "staff", id, name: staffName(id) });

function pinNear(center: LatLon, rnd: () => number, spreadKm = 0.035): LocationInfo {
  // Box–Muller for a natural-looking scatter around a hotspot.
  const r = Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-9))) * spreadKm;
  const t = rnd() * Math.PI * 2;
  const lat = +(center.lat + (r * Math.sin(t)) / 111.32).toFixed(6);
  const lon = +(center.lon + (r * Math.cos(t)) / (111.32 * Math.cos((center.lat * Math.PI) / 180))).toFixed(6);
  return { method: "pin", purok: purokAt(lat, lon), landmarkId: null, lat, lon };
}

function atLandmark(id: string): LocationInfo {
  const l = landmarkById(id)!;
  return { method: "landmark", purok: l.purok, landmarkId: l.id, lat: l.lat, lon: l.lon };
}

function atPurok(id: string): LocationInfo {
  const c = purokCenter(id)!;
  return { method: "purok", purok: id, landmarkId: null, lat: c.lat, lon: c.lon };
}

/** A pin a few meters from a landmark, for clustered live reports. */
function besideLandmark(id: string, dLat: number, dLon: number): LocationInfo {
  const l = landmarkById(id)!;
  const lat = +(l.lat + dLat).toFixed(6);
  const lon = +(l.lon + dLon).toFixed(6);
  return { method: "pin", purok: purokAt(lat, lon), landmarkId: null, lat, lon };
}

const PLACE_HINTS: [RegExp, LatLon][] = [
  [/Purok 3|Block 4|day care/i, THESIS_HOTSPOTS.A],
  [/Purok 1|alley|main road|gate/i, THESIS_HOTSPOTS.B],
  [/Purok 4|creek|sapa|junkshop|gym/i, THESIS_HOTSPOTS.C],
  [/Purok 2|basketball court/i, landmarkById("p2-court")!],
  [/Purok 5|school|tulay/i, landmarkById("p5-school")!],
  [/Health Center/i, landmarkById("health")!],
  [/multipurpose hall/i, landmarkById("mph")!],
];

function historyDrafts(now: number, rnd: () => number): Draft[] {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const residents = RESIDENTS.slice(1).map((r) => r.id);
  const scatter = (): LocationInfo => pinNear({ lat: 14.3681 + 0.0238 * (0.12 + rnd() * 0.76), lon: 121.028 + 0.024 * (0.12 + rnd() * 0.76) }, rnd, 0.02);
  const byCat = (c: Category) => CORPUS.filter((r) => r[1] === c);
  const plan: [Category, number][] = [["sanitation", 20], ["peace", 16], ["infra", 18], ["documents", 10], ["social", 10]];
  const drafts: Draft[] = [];
  for (const [category, n] of plan) {
    for (let i = 0; i < n; i++) {
      const [text, , urgency] = pick(byCat(category));
      const roll = rnd();
      // Pin where the text says it happened; otherwise lean toward the thesis hotspots.
      const anchor = PLACE_HINTS.find(([re]) => re.test(text))?.[1];
      const purokMention = text.match(/Purok (\d)/)?.[1];
      let location: LocationInfo;
      if (!CATEGORY[category].located) location = atPurok(purokMention ? `P${purokMention}` : pick(["P1", "P2", "P3", "P4", "P5"]));
      else if (anchor) location = pinNear(anchor, rnd);
      else if (category === "sanitation") location = roll < 0.55 ? pinNear(THESIS_HOTSPOTS.A, rnd) : roll < 0.75 ? pinNear(THESIS_HOTSPOTS.C, rnd) : scatter();
      else if (category === "peace") location = roll < 0.6 ? pinNear(THESIS_HOTSPOTS.B, rnd) : scatter();
      else location = roll < 0.45 ? pinNear(THESIS_HOTSPOTS.C, rnd) : roll < 0.6 ? pinNear(THESIS_HOTSPOTS.B, rnd) : scatter();
      const s = rnd();
      const status: Status = s < 0.84 ? "resolved" : s < 0.92 ? "referred" : s < 0.96 ? "duplicate" : "withdrawn";
      drafts.push({
        text,
        category,
        urgency,
        createdAt: now - (1.6 + rnd() * 27.5) * DAY,
        status,
        residentId: pick(residents),
        channel: rnd() < 0.8 ? "online" : rnd() < 0.5 ? "walkin" : "phone",
        location,
      });
    }
  }
  // A handful of cases from over two years ago, so data retention has something to anonymize.
  for (let i = 0; i < 5; i++) {
    const category = pick<Category>(["sanitation", "infra", "peace"]);
    const [text, , urgency] = pick(byCat(category));
    drafts.push({ text, category, urgency, createdAt: now - (760 + rnd() * 90) * DAY, status: "resolved", residentId: pick(residents), channel: "online", location: scatter() });
  }
  return drafts;
}

function liveDrafts(now: number): Draft[] {
  const ago = (m: number) => now - m * MIN;
  return [
    {
      text: "Yung poste sa may sapa nakatagilid na tapos may nakalaylay na kable, umuulan pa, natatakot kami dumaan",
      category: "infra", urgency: "high", createdAt: ago(6), status: "received", residentId: "r_carmela",
      location: { ...atLandmark("p4-creek"), method: "pin", lat: 14.37467, lon: 121.03785 }, dangerNow: true,
    },
    {
      text: "Tatlong araw na po walang dumadaan na truck ng basura sa Purok 3 Block 4, umaapaw na sa tabi ng day care",
      category: "sanitation", urgency: "medium", createdAt: ago(24), status: "received", residentId: "r_benjie",
      location: { method: "pin", purok: "P3", landmarkId: null, lat: 14.38852, lon: 121.04672 }, residentCategory: "sanitation",
    },
    {
      text: "Senior po ako, tanong ko lang kung kailan ang susunod na pamimigay ng ayuda sa Purok 2",
      category: "social", urgency: "normal", createdAt: ago(41), status: "received", residentId: null, channel: "walkin",
      contact: { name: "Walk-in resident (senior)", phone: "09171234412", sms: true }, location: atPurok("P2"),
      events: () => [ev(ago(41), "submitted", "internal", staffActor("s_jessa"), undefined, { assisted: "walkin" })],
    },
    {
      text: "Gabi-gabing videoke sa Purok 1 Alley hanggang alas-tres, may sanggol kami dito",
      category: "peace", urgency: "medium", createdAt: ago(70), status: "received", residentId: null, channel: "phone",
      contact: { name: "Caller from Purok 1", phone: "09281231907", sms: false }, location: atLandmark("p1-alley"),
      events: () => [ev(ago(70), "submitted", "internal", staffActor("s_jessa"), undefined, { assisted: "phone" })],
    },
    {
      text: "Kailangan ko po ng barangay clearance para sa trabaho, ano po ang kailangan dalhin",
      category: "documents", urgency: "normal", createdAt: ago(125), status: "review", residentId: "r_aileen", location: null,
      events: (r) => [
        ev(r.createdAt, "submitted", "resident", { kind: "resident", id: "r_aileen", name: "Aileen Robles" }),
        ev(ago(12), "review_started", "resident", staffActor("s_jessa")),
      ],
      extra: { firstActionAt: ago(12) },
    },
    {
      text: "May malaking butas sa kalsada malapit sa amin, delikado sa mga motor",
      category: "infra", urgency: "medium", createdAt: ago(27 * 60), status: "needs_info", residentId: "r_liza", location: atPurok("P3"),
      events: (r) => [
        ev(r.createdAt, "submitted", "resident", { kind: "resident", id: "r_liza", name: "Liza Ramos" }),
        ev(ago(21 * 60), "review_started", "resident", staffActor("s_jessa")),
        ev(ago(20 * 60), "info_requested", "resident", staffActor("s_jessa"), "Salamat po sa ulat. Saan po eksakto ang butas? Pakilagay ang pin sa mapa o ang pinakamalapit na landmark para mapuntahan ng Public Works."),
      ],
      extra: { firstActionAt: ago(21 * 60) },
    },
    {
      text: "Bukas ang manhole sa tapat ng Purok 1 Main Road, natakpan lang ng karton, madilim pa doon pag gabi",
      category: "infra", urgency: "high", createdAt: ago(35), status: "queued", residentId: "r_dennis", location: atLandmark("p1-main"), triaged: true,
    },
    {
      text: "Patay ang ilaw sa poste sa Purok 3 Corner, madilim ang daan pauwi",
      category: "infra", urgency: "medium", createdAt: ago(200), status: "queued", residentId: "r_benjie", location: atLandmark("p3-corner"), triaged: true,
    },
    {
      text: "Barado na naman ang kanal sa may Purok 1 Gate, tumataas ang tubig pag umuulan",
      category: "sanitation", urgency: "medium", createdAt: ago(50), status: "queued", residentId: "r_jun", location: atLandmark("p1-gate"), triaged: true,
    },
    {
      text: "Kailan po pwedeng kumuha ng certificate of indigency, para sa scholarship ng anak ko",
      category: "documents", urgency: "normal", createdAt: ago(7 * 60), status: "queued", residentId: "r_jun", location: null, triaged: true,
    },
    {
      text: "Paano po mag-apply ng tulong para sa wheelchair ng tatay kong PWD, hindi na siya makalakad",
      category: "social", urgency: "normal", createdAt: ago(74 * 60), status: "queued", residentId: "r_aileen", location: atPurok("P2"), triaged: true,
    },
    {
      text: "Maraming kabataan nag-iinuman sa Purok 4 Gym tuwing gabi at nagbabasag ng bote",
      category: "peace", urgency: "medium", createdAt: ago(300), status: "in_progress", residentId: "r_carmela", location: atLandmark("p4-gym"),
      triaged: true, assigneeId: "s_arnel",
      events: (r) => [
        ev(ago(170), "started", "resident", staffActor("s_arnel")),
        ev(ago(160), "note", "internal", staffActor("s_arnel"), "Dalawang tanod ang iikot sa gym 9 PM–12 AM ngayong linggo. Kakausapin ang may-ari ng tindahan sa tabi na nagbebenta ng alak."),
        ev(ago(150), "update", "resident", staffActor("s_arnel"), "Magpapatrolya ang tanod sa Purok 4 Gym tuwing gabi ngayong linggo."),
      ],
    },
    {
      text: "Malalim na lubak sa kanto ng Purok 1 Main Road at Sampaguita Ave, may sumemplang na tricycle kahapon",
      category: "infra", urgency: "medium", createdAt: ago(26 * 60), status: "in_progress", residentId: "r_liza",
      location: { method: "pin", purok: "P1", landmarkId: null, lat: 14.38243, lon: 121.04096 }, triaged: true, assigneeId: "s_mario",
      events: () => [
        ev(ago(20 * 60), "started", "resident", staffActor("s_mario")),
        ev(ago(19 * 60), "note", "internal", staffActor("s_mario"), "Kailangan ng 3 sako ng cold mix. Kukunin sa bodega bukas ng umaga."),
        ev(ago(90), "update", "resident", staffActor("s_mario"), "Nalagyan na ng babala ang lubak. Tatapalan ito bukas ng umaga, 8–10 AM."),
      ],
    },
    {
      text: "Maraming asong gala sa Purok 1 Alley, may nakagat nang bata kahapon",
      category: "sanitation", urgency: "medium", createdAt: ago(9 * 60), status: "in_progress", residentId: "r_jun", location: atLandmark("p1-alley"),
      triaged: true, assigneeId: "s_grace",
      events: () => [ev(ago(6 * 60), "started", "resident", staffActor("s_grace"))],
    },
    {
      text: "Paulit-ulit na sinasaktan ng kapitbahay ang asawa niya, naririnig namin gabi-gabi ang sigawan",
      category: "peace", urgency: "high", createdAt: ago(130), status: "in_progress", residentId: "r_dennis", location: atPurok("P1"),
      triaged: true, assigneeId: "s_arnel", restricted: true,
      events: () => [
        ev(ago(118), "started", "resident", staffActor("s_arnel")),
        ev(ago(110), "note", "internal", staffActor("s_arnel"), "Restricted. Na-endorse sa VAWC desk. Huwag ibunyag ang pangalan ng nag-ulat."),
      ],
    },
    {
      text: "Hindi nakuha ang basura sa Purok 3 Day Care noong Lunes, nangangamoy na at may mga langaw",
      category: "sanitation", urgency: "medium", createdAt: ago(4 * 24 * 60), status: "resolved", residentId: "r_liza", location: atLandmark("p3-daycare"),
      triaged: true, assigneeId: "s_grace",
      events: () => [
        ev(ago(3.8 * 24 * 60), "started", "resident", staffActor("s_grace")),
        ev(ago(2 * 24 * 60), "resolved", "resident", staffActor("s_grace"), "Nakolekta na ang basura noong Huwebes, 9:30 AM. Idinagdag ang Purok 3 Day Care sa ruta tuwing Lunes at Huwebes."),
      ],
      extra: { outcome: "Nakolekta na ang basura noong Huwebes, 9:30 AM. Idinagdag ang Purok 3 Day Care sa ruta tuwing Lunes at Huwebes.", closedAt: ago(2 * 24 * 60) },
    },
    {
      text: "Nag-i-spark ang kable ng kuryente sa poste sa tapat ng Purok 5 Talipapa, may naamoy kaming sunog",
      category: "infra", urgency: "high", createdAt: ago(6 * 60), status: "referred", residentId: "r_aileen", location: atLandmark("p5-market"), triaged: true,
      events: () => [
        ev(ago(5.8 * 60), "referred", "resident", staffActor("s_jessa"), "Inirefer sa electric utility (16211). Naka-standby ang tanod para ilayo ang mga tao habang hinihintay ang crew.", { office: "Electric utility hotline" }),
      ],
      extra: { referral: { office: "Electric utility hotline" }, closedAt: ago(5.8 * 60) },
    },
    // A flood surge at the market: four reports about one problem, ready to become an incident.
    {
      text: "Baha na sa tapat ng Talipapa, hanggang tuhod na, barado yung kanal sa kanto",
      category: "sanitation", urgency: "high", createdAt: ago(18), status: "received", residentId: "r_carmela", location: besideLandmark("p5-market", 0.00018, -0.00012),
    },
    {
      text: "Umaapaw ang kanal sa Purok 5 Talipapa, pumapasok na ang tubig sa mga tindahan",
      category: "sanitation", urgency: "medium", createdAt: ago(31), status: "received", residentId: "r_liza", location: besideLandmark("p5-market", -0.00014, 0.0002),
    },
    {
      text: "Hindi na madaanan ang daan papuntang palengke sa Purok 5 dahil sa baha at basura sa kanal",
      category: "sanitation", urgency: "medium", createdAt: ago(52), status: "queued", residentId: "r_benjie", location: besideLandmark("p5-market", 0.00025, 0.00016), triaged: true,
    },
    {
      text: "Baha sa likod ng Talipapa, may matanda kaming kasama na hindi makalabas ng bahay",
      category: "sanitation", urgency: "high", createdAt: ago(70), status: "queued", residentId: null, channel: "walkin", triaged: true,
      contact: { name: "Walk-in resident (Purok 5)", phone: "09204445566", sms: true }, location: besideLandmark("p5-market", -0.00022, -0.00018),
      events: () => [ev(ago(70), "submitted", "internal", staffActor("s_jessa"), undefined, { assisted: "walkin" })],
    },
    // A neighbor dispute already before the Lupon, with one hearing held and the next one set.
    {
      text: "Inaangkin ng kapitbahay ang bahagi ng bakuran namin at sinira ang bakod, ayaw makipag-usap nang maayos",
      category: "peace", urgency: "normal", createdAt: ago(5 * 24 * 60), status: "in_progress", residentId: "r_aileen", location: atPurok("P2"),
      triaged: true, assigneeId: "s_arnel",
      events: () => [ev(ago(5 * 24 * 60 - 120), "started", "resident", staffActor("s_arnel"))],
    },
  ];
}

export function buildSeed(now = Date.now()): DB {
  eventSeq = 0;
  const rnd = mulberry32(2026);
  const drafts = [...historyDrafts(now, rnd), ...liveDrafts(now)].sort((a, b) => a.createdAt - b.createdAt);
  const requests: ServiceRequest[] = [];
  let seq = 100;

  for (const d of drafts) {
    seq += 1;
    const id = `q_${seq.toString(36)}`;
    const residentName = RESIDENTS.find((r) => r.id === d.residentId)?.name;
    const prediction = suggest(d.text);
    const team = CATEGORY_TEAM[d.category];
    const isHistory = !d.events && d.status !== "received" && d.triaged === undefined;
    const triaged = d.triaged || isHistory || ["queued", "in_progress", "resolved", "referred"].includes(d.status);
    // Triage happens after arrival and never in the future, even for minutes-old seeded cases.
    const rawFirst = d.createdAt + (d.urgency === "high" ? 8 + rnd() * 25 : d.urgency === "medium" ? 30 + rnd() * 240 : 60 + rnd() * 900) * MIN;
    // Live cases with scripted staff events must be triaged before those events happen.
    const scriptedBound = d.events ? d.createdAt + Math.min(20 * MIN, (now - d.createdAt) / 4) : Infinity;
    const firstActionAt = d.extra?.firstActionAt ?? (triaged ? Math.max(d.createdAt + MIN, Math.min(rawFirst, scriptedBound, now - 4 * MIN)) : null);
    const triager = rnd() < 0.8 ? "s_jessa" : "s_ramon";

    const req: ServiceRequest = {
      id,
      ref: refFor(seq, d.createdAt),
      residentId: d.residentId,
      contact: d.contact ?? null,
      channel: d.channel ?? "online",
      text: d.text,
      residentCategory: d.residentCategory ?? null,
      dangerNow: d.dangerNow ?? false,
      location: d.location,
      hasPhoto: false,
      createdAt: d.createdAt,
      updatedAt: d.createdAt,
      status: d.status,
      prediction,
      triage: triaged
        ? {
            category: d.category,
            urgency: d.urgency,
            by: triager,
            at: firstActionAt!,
            correctedCategory: prediction.category !== d.category,
            correctedUrgency: prediction.urgency !== d.urgency,
          }
        : null,
      team: triaged ? team : null,
      assigneeId: d.assigneeId ?? null,
      restricted: d.restricted ?? false,
      duplicateOf: null,
      referral: null,
      outcome: null,
      outcomePhoto: false,
      firstActionAt,
      startedAt: null,
      closedAt: null,
      followUp: false,
      events: [],
      idemKey: null,
      incidentId: null,
      anonymizedAt: null,
      ...d.extra,
    };

    const custom = d.events?.(req) ?? [];
    const events: CaseEvent[] = [];
    if (!custom.some((e) => e.type === "submitted")) {
      events.push(ev(d.createdAt, "submitted", "resident", d.residentId ? { kind: "resident", id: d.residentId, name: residentName! } : staffActor("s_jessa")));
    }
    if (triaged) {
      events.push(ev(firstActionAt!, "triaged", "resident", staffActor(triager), undefined, { category: d.category, urgency: d.urgency, team }));
      if (req.assigneeId) events.push(ev(Math.min(firstActionAt! + 2 * MIN, now - 2 * MIN), "assigned", "internal", staffActor(req.assigneeId), undefined, { assignee: req.assigneeId, via: "claim" }));
    }
    if (isHistory) {
      const handler = HANDLER_FOR[team];
      const startedAt = firstActionAt! + (5 + rnd() * 90) * MIN;
      const closedAt = startedAt + (d.urgency === "high" ? 1 + rnd() * 4 : d.urgency === "medium" ? 5 + rnd() * 40 : 10 + rnd() * 80) * HOUR;
      if (d.status === "resolved") {
        req.assigneeId = handler;
        req.startedAt = startedAt;
        req.outcome = OUTCOME[d.category];
        events.push(ev(startedAt - MIN, "assigned", "internal", staffActor(handler), undefined, { assignee: handler, via: "claim" }));
        events.push(ev(startedAt, "started", "resident", staffActor(handler)));
        events.push(ev(Math.min(closedAt, now - HOUR), "resolved", "resident", staffActor(handler), OUTCOME[d.category]));
      } else if (d.status === "referred") {
        const office = d.category === "infra" ? "City Engineering Department" : d.category === "sanitation" ? "City Health Office" : d.category === "peace" ? "Lupon Tagapamayapa" : "City Social Welfare & Development";
        req.referral = { office };
        events.push(ev(Math.min(closedAt, now - HOUR), "referred", "resident", staffActor(triager), `Inirefer sa ${office}.`, { office }));
      } else if (d.status === "withdrawn") {
        events.push(ev(Math.min(closedAt, now - HOUR), "withdrawn", "resident", { kind: "resident", id: d.residentId!, name: residentName! }));
      } else {
        events.push(ev(Math.min(firstActionAt! + 10 * MIN, now - HOUR), "duplicate", "resident", staffActor(triager)));
      }
      req.closedAt = Math.min(closedAt, now - HOUR);
    }
    events.push(...custom);
    events.sort((a, b) => a.at - b.at);
    req.events = events;
    const started = events.find((e) => e.type === "started");
    if (started) req.startedAt = started.at;
    req.updatedAt = events.at(-1)?.at ?? req.createdAt;
    requests.push(req);
  }

  // Link the open duplicate-shaped history items and the live pothole duplicate.
  const pothole = requests.find((r) => r.residentId === "r_liza" && r.status === "in_progress")!;
  seq += 1;
  const dupAt = now - 23 * HOUR;
  requests.push({
    ...pothole,
    id: `q_${seq.toString(36)}`,
    ref: refFor(seq, dupAt),
    residentId: "r_dennis",
    text: "Ang laki ng lubak sa may Main Road, kanto ng Sampaguita Ave, muntik na akong matumba sa motor",
    createdAt: dupAt,
    updatedAt: dupAt + 40 * MIN,
    status: "duplicate",
    prediction: suggest("Ang laki ng lubak sa may Main Road, kanto ng Sampaguita Ave, muntik na akong matumba sa motor"),
    assigneeId: null,
    duplicateOf: pothole.id,
    firstActionAt: dupAt + 40 * MIN,
    startedAt: null,
    closedAt: dupAt + 40 * MIN,
    events: [
      ev(dupAt, "submitted", "resident", { kind: "resident", id: "r_dennis", name: "Dennis Yap" }),
      ev(dupAt + 40 * MIN, "duplicate", "resident", staffActor("s_jessa"), `Kapareho ng naunang ulat ${pothole.ref}. Doon namin ibabalita ang mga update.`, { original: pothole.id, originalRef: pothole.ref }),
    ],
    location: { method: "pin", purok: "P1", landmarkId: null, lat: 14.38251, lon: 121.04106 },
  });
  requests.sort((a, b) => a.createdAt - b.createdAt);

  // Field work: a finished patrol plus tonight's follow-up on the gym case, and a tanod guarding the open manhole.
  const roster = buildRoster(now);
  const slot = slotAt(now);
  const guard = roster.find((d) => d.date === slot.date && d.shift === slot.shift && d.tanodId !== "s_joel")?.tanodId ?? "s_ben";
  const gym = requests.find((r) => r.text.startsWith("Maraming kabataan nag-iinuman"))!;
  const manhole = requests.find((r) => r.text.startsWith("Bukas ang manhole"))!;
  const blank = { acceptedAt: null, arrivedAt: null, closedAt: null, result: null, report: null, hasPhoto: false, closeReason: null };
  const assignments: FieldAssignment[] = [
    {
      ...blank,
      id: "fa_gym1",
      requestId: gym.id,
      tanodId: "s_joel",
      assignedBy: "s_arnel",
      instructions: "Ikot sa Purok 4 Gym. Kausapin din ang may-ari ng tindahan sa tabi na nagbebenta ng alak.",
      status: "done",
      assignedAt: now - 165 * MIN,
      acceptedAt: now - 162 * MIN,
      arrivedAt: now - 148 * MIN,
      closedAt: now - 120 * MIN,
      result: "settled",
      report: "Anim na kabataan ang nadatnan, pinauwi nang maayos. Kinausap ang tindera; hindi na raw magbebenta ng alak sa menor de edad. Babalik ako sa susunod na ikot.",
    },
    {
      ...blank,
      id: "fa_gym2",
      requestId: gym.id,
      tanodId: "s_joel",
      assignedBy: "s_arnel",
      instructions: "Ikalawang gabi ng ikot sa gym. Tingnan kung bumalik ang grupo at kung may bote pa sa daan.",
      status: "assigned",
      assignedAt: now - 12 * MIN,
    },
    {
      ...blank,
      id: "fa_manhole",
      requestId: manhole.id,
      tanodId: guard,
      assignedBy: "s_ramon",
      instructions: "Lagyan ng harang at bantayan ang bukas na manhole hanggang dumating ang Public Works.",
      status: "on_scene",
      assignedAt: now - 25 * MIN,
      acceptedAt: now - 23 * MIN,
      arrivedAt: now - 14 * MIN,
    },
  ];
  for (const a of assignments) {
    const req = requests.find((r) => r.id === a.requestId)!;
    const tanod = staffActor(a.tanodId);
    const meta = { assignment: a.id, tanod: a.tanodId };
    req.events.push(ev(a.assignedAt, "tanod_assigned", "internal", staffActor(a.assignedBy), a.instructions ?? undefined, meta));
    if (a.acceptedAt) req.events.push(ev(a.acceptedAt, "tanod_accepted", "resident", tanod, undefined, meta));
    if (a.arrivedAt) req.events.push(ev(a.arrivedAt, "tanod_arrived", "resident", tanod, undefined, meta));
    if (a.report) req.events.push(ev(a.closedAt!, "field_report", "internal", tanod, a.report, { ...meta, result: a.result }));
    req.events.sort((x, y) => x.at - y.at);
    req.updatedAt = Math.max(req.updatedAt, req.events.at(-1)!.at);
  }

  // Lupon: the boundary dispute, filed four days ago, one mediation hearing held and the next one set.
  const dispute = requests.find((r) => r.text.startsWith("Inaangkin ng kapitbahay"))!;
  const nineAm = (days: number) => Date.parse(`${addDays(manilaDate(now), days)}T01:00:00Z`);
  const year = new Intl.DateTimeFormat("en-PH", { year: "numeric", timeZone: "Asia/Manila" }).format(now);
  const kp: KpCase = {
    id: "kp_seed1",
    number: `KP-${year}-006`,
    requestId: dispute.id,
    complainant: "Aileen Robles",
    respondent: "Celso Ramirez",
    respondentAddress: "Purok 2, katabing bahay sa kanan ng nagrereklamo",
    nature: "Pag-angkin sa bahagi ng bakuran at pagsira ng bakod na kawayan. Hinihiling na ibalik ang bakod sa dating hangganan.",
    filedAt: now - 4 * DAY,
    filedBy: "s_jessa",
    stage: "mediation",
    mediationStart: now - 4 * DAY,
    conciliationStart: null,
    extended: false,
    hearings: [
      {
        id: "kh_seed1",
        kind: "mediation",
        at: nineAm(-2),
        summonsServed: true,
        result: "continued",
        notes: "Dumalo ang dalawa. Hiniling ng inirereklamo na makita muna ang plano ng lote bago magkasundo.",
        recordedAt: nineAm(-2) + 2 * HOUR,
      },
      { id: "kh_seed2", kind: "mediation", at: nineAm(2), summonsServed: false, result: null, notes: null, recordedAt: null },
    ],
    settlement: null,
    closedAt: null,
    closeNote: null,
  };
  const hearingText = (at: number) =>
    `Pagdinig sa Lupon (pamamagitan) sa ${fmtDate(at, "fil", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}, Barangay Hall. Dumating sa oras at magdala ng anumang katibayan.`;
  dispute.events.push(
    ev(kp.filedAt, "kp_filed", "resident", staffActor("s_jessa"), `Naisampa sa Lupon Tagapamayapa bilang ${kp.number}. Ipapatawag ng Punong Barangay ang magkabilang panig para sa pamamagitan.`, { kp: kp.id }),
    ev(kp.filedAt + HOUR, "kp_hearing", "resident", staffActor("s_jessa"), hearingText(nineAm(-2)), { kp: kp.id, at: nineAm(-2) }),
    ev(nineAm(-2) + 2 * HOUR, "kp_recorded", "internal", staffActor("s_jessa"), `Continued to another date · ${kp.hearings[0].notes}`, { kp: kp.id, result: "continued" }),
    ev(nineAm(-2) + 3 * HOUR, "kp_hearing", "resident", staffActor("s_jessa"), hearingText(nineAm(2)), { kp: kp.id, at: nineAm(2) }),
  );
  dispute.events.sort((x, y) => x.at - y.at);
  dispute.updatedAt = dispute.events.at(-1)!.at;

  const NOTIFY: Partial<Record<CaseEvent["type"], NotificationType>> = {
    info_requested: "info_requested",
    update: "update",
    resolved: "resolved",
    started: "started",
    triaged: "queued",
    review_started: "review_started",
  };
  const notifications: ResidentNotification[] = [];
  for (const r of requests.filter((q) => q.residentId === "r_liza")) {
    for (const e of r.events.filter((x) => x.vis === "resident" && x.actor.kind === "staff")) {
      const type = NOTIFY[e.type];
      if (!type) continue;
      notifications.push({ id: `n_${e.id}`, residentId: "r_liza", requestId: r.id, ref: r.ref, type, at: e.at, read: now - e.at > 18 * HOUR && type !== "info_requested" });
    }
  }

  // What the SMS gateway would have sent: Liza's recent updates, a walk-in receipt, Joel's new assignment.
  const SEED_SMS: Partial<Record<NotificationType, string>> = {
    queued: "Naipasa na ang ulat mo sa team ng barangay. Abangan ang susunod na update.",
    started: "Inaaksyunan na ang ulat mo.",
    update: "May bagong update mula sa barangay. Buksan ang Tugon app.",
    resolved: "Naresolba na ang ulat mo.",
    info_requested: "Kailangan ng barangay ng dagdag na detalye. Buksan ang Tugon app para sumagot.",
  };
  const sms: SmsMessage[] = [];
  const text = (to: string, body: string, purpose: SmsMessage["purpose"], requestId: string, at: number) =>
    sms.push({ id: `sms_seed${sms.length + 1}`, to, body, purpose, requestId, at, status: "simulated", error: null });
  for (const n of notifications) {
    const body = SEED_SMS[n.type];
    if (body && now - n.at < 3 * DAY) text("09171234567", `Tugon ${n.ref}: ${body}`, "resident", n.requestId, n.at);
  }
  const walkIn = requests.find((r) => r.contact?.phone === "09204445566")!;
  text("09204445566", `Tugon: Natanggap ng ${SETTINGS.barangay} ang ulat mo. Ref ${walkIn.ref}. Itetext ka namin kapag may update.`, "reporter", walkIn.id, walkIn.createdAt);
  text("09195550103", `Tugon Tanod: May bagong assignment ka, ${gym.ref} sa Purok 4 Gym. Buksan ang Tanod app para tanggapin.`, "tanod", gym.id, now - 12 * MIN);
  sms.sort((a, b) => b.at - a.at);

  const audit: AuditEntry[] = requests
    .flatMap((r) => r.events.filter((e) => e.actor.kind === "staff" && now - e.at < 3 * DAY).map((e) => ({ e, r })))
    .map(({ e, r }) => ({
      id: `a_${e.id}`,
      at: e.at,
      actorId: e.actor.id!,
      actorName: e.actor.name,
      action: e.type,
      target: r.ref,
      detail: e.type === "triaged" ? `${e.meta?.category} · ${e.meta?.urgency}` : undefined,
    }));
  audit.push(
    { id: "a_admin1", at: now - 2.2 * DAY, actorId: "s_paolo", actorName: "Paolo Reyes", action: "targets_changed", detail: "Normal target 96h → 72h" },
    { id: "a_admin2", at: now - 1.4 * DAY, actorId: "s_paolo", actorName: "Paolo Reyes", action: "staff_invited", target: "rhea@sampaguita.gov.ph", detail: "Handler · Social Services" },
  );
  audit.sort((a, b) => b.at - a.at);

  return {
    version: 3,
    rev: 1,
    seq,
    createdAt: now,
    residents: RESIDENTS,
    staff: STAFF,
    teams: TEAMS,
    requests,
    notifications,
    audit,
    settings: SETTINGS,
    idem: {},
    roster,
    assignments,
    incidents: [],
    kp: [kp],
    sms,
  };
}

/** Reference numbers read like a logbook entry: TGN-YYMM-####. */
export function refFor(seq: number, at: number) {
  const parts = new Intl.DateTimeFormat("en-PH", { year: "2-digit", month: "2-digit", timeZone: "Asia/Manila" }).formatToParts(at);
  const part = (t: string) => parts.find((p) => p.type === t)!.value;
  return `TGN-${part("year")}${part("month")}-${String(seq).padStart(4, "0")}`;
}
