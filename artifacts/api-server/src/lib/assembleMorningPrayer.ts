/**
 * Morning Prayer Assembly Service
 *
 * Assembles the complete 1979 Episcopal BCP Morning Prayer Rite II
 * for a given date as a Slide[] array. Shared daily cache means the
 * first user bears assembly cost; every user after gets it in ~5ms.
 */

import { eq, inArray } from "drizzle-orm";
import {
  db,
  bcpTextsTable,
  morningPrayerCacheTable,
} from "@workspace/db";
import { getOfficeDay } from "./liturgicalCalendar";
import { getCanticles } from "./canticleSelector";
import { getLectionaryReadings } from "./lectionary";
import { getLesson } from "./scriptureService";

// ── Types ────────────────────────────────────────────────────────────────────

export type SlideType =
  | "opening"
  | "opening_sentence"
  | "confession"
  | "absolution"
  | "invitatory"
  | "invitatory_psalm"
  | "psalm"
  | "lesson"
  | "canticle"
  | "creed"
  | "lords_prayer"
  | "suffrages"
  | "collect"
  | "prayer_for_mission"
  | "general_thanksgiving"
  | "closing";

export interface CallAndResponseLine {
  speaker: "officiant" | "people" | "both";
  text: string;
}

export interface Slide {
  id: string;
  type: SlideType;
  emoji: string;
  eyebrow: string;
  title: string | null;
  content: string;
  isCallAndResponse: boolean;
  callAndResponseLines: CallAndResponseLine[] | null;
  bcpReference: string | null;
  isScrollable: boolean;
  scrollHint: string | null;
  metadata: Record<string, unknown>;
}

export interface OfficeDayInfo {
  season: string;
  liturgicalYear: number;
  sundayLabel: string;
  weekdayLabel: string;
  properNumber: number | null;
  feastName: string | null;
  isMajorFeast: boolean;
  useAlleluia: boolean;
  totalSlides: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function slide(
  id: string,
  type: SlideType,
  emoji: string,
  eyebrow: string,
  content: string,
  overrides: Partial<Slide> = {},
): Slide {
  return {
    id,
    type,
    emoji,
    eyebrow,
    title: null,
    content,
    isCallAndResponse: false,
    callAndResponseLines: null,
    bcpReference: null,
    isScrollable: false,
    scrollHint: null,
    metadata: {},
    ...overrides,
  };
}

const PSALM_EMOJI: Record<number, string> = {};
const PRAISE_PSALMS = [
  8, 19, 29, 33, 47, 65, 66, 67, 68, 96, 98, 100, 103, 104, 111, 113, 117,
  135, 136, 145, 146, 147, 148, 149, 150,
];
const LAMENT_PSALMS = [
  6, 13, 22, 31, 38, 42, 44, 51, 55, 74, 77, 79, 80, 85, 86, 88, 90, 102,
  130, 137, 143,
];
const CONFIDENCE_PSALMS = [11, 16, 23, 27, 46, 62, 71, 91, 121, 125, 131];
const THANKSGIVING_PSALMS = [9, 18, 30, 34, 40, 92, 107, 116, 118, 138];
const ROYAL_PSALMS = [2, 20, 21, 45, 72, 89, 101, 110, 132, 144];
const WISDOM_PSALMS = [1, 15, 24, 37, 49, 73, 112, 119, 127, 128, 133];

PRAISE_PSALMS.forEach((n) => (PSALM_EMOJI[n] = "🌟"));
LAMENT_PSALMS.forEach((n) => (PSALM_EMOJI[n] = "💧"));
CONFIDENCE_PSALMS.forEach((n) => (PSALM_EMOJI[n] = "🏔️"));
THANKSGIVING_PSALMS.forEach((n) => (PSALM_EMOJI[n] = "🌾"));
ROYAL_PSALMS.forEach((n) => (PSALM_EMOJI[n] = "👑"));
WISDOM_PSALMS.forEach((n) => (PSALM_EMOJI[n] = "🌿"));

const CANTICLE_EMOJI: Record<string, string> = {
  canticle_8: "🌊",
  canticle_9: "💧",
  canticle_10: "🔍",
  canticle_11: "✨",
  canticle_12: "🌍",
  canticle_13: "🌟",
  canticle_14: "🙏",
  canticle_16: "🌅",
  canticle_18: "🕊️",
  canticle_19: "🌸",
  canticle_20: "✨",
  canticle_21: "🌟",
};

const SEASON_LABELS: Record<string, string> = {
  advent: "Advent 🕯️",
  christmas: "Christmas 🌟",
  epiphany: "Epiphany ✨",
  lent: "Lent 🌿",
  holy_week: "Holy Week ✝️",
  easter: "Eastertide 🌸",
  season_after_pentecost: "Season after Pentecost 🌳",
};

/** Parse suffrage text (V: / R: lines) into call-and-response lines */
function parseSuffrages(text: string): CallAndResponseLine[] {
  const lines: CallAndResponseLine[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("V.") || line.startsWith("V ")) {
      lines.push({ speaker: "officiant", text: line.replace(/^V\.?\s*/, "") });
    } else if (line.startsWith("R.") || line.startsWith("R ")) {
      lines.push({ speaker: "people", text: line.replace(/^R\.?\s*/, "") });
    } else {
      // continuation of previous line or standalone
      if (lines.length > 0) {
        lines[lines.length - 1].text += " " + line;
      }
    }
  }
  return lines;
}

/** Pick which opening sentence to use (rotate by day of month) */
function pickOpeningSentenceKey(
  season: string,
  dayOfMonth: number,
): string {
  const seasonMap: Record<string, { prefix: string; count: number }> = {
    advent: { prefix: "opening_sentence_advent_", count: 3 },
    christmas: { prefix: "opening_sentence_christmas_", count: 2 },
    epiphany: { prefix: "opening_sentence_epiphany_", count: 3 },
    lent: { prefix: "opening_sentence_lent_", count: 5 },
    holy_week: { prefix: "opening_sentence_holyweek_", count: 2 },
    easter: { prefix: "opening_sentence_easter_", count: 5 },
    season_after_pentecost: {
      prefix: "opening_sentence_anytime_",
      count: 7,
    },
  };
  const entry = seasonMap[season] ?? { prefix: "opening_sentence_anytime_", count: 7 };
  const index = (dayOfMonth % entry.count) + 1;
  return `${entry.prefix}${index}`;
}

/** Pick prayer for mission (rotate by day of week) */
function pickMissionPrayerKey(dayOfWeek: number): string {
  return `prayer_mission_${(dayOfWeek % 3) + 1}`;
}

/** Pick which suffrages set to use (A or B, alternate by week) */
function pickSuffragesKey(weekInSeason: number): string {
  return weekInSeason % 2 === 1 ? "suffrages_a" : "suffrages_b";
}

// ── Main Assembly ─────────────────────────────────────────────────────────────

export async function assembleMorningPrayer(
  date: Date,
  userId: number,
): Promise<{
  slides: Slide[];
  officeDay: OfficeDayInfo;
  fromCache: boolean;
}> {
  const cacheDate = startOfDay(date);
  const cacheDateStr = cacheDate.toISOString().slice(0, 10);

  // 1. Check cache
  const cached = await db
    .select()
    .from(morningPrayerCacheTable)
    .where(eq(morningPrayerCacheTable.cacheDate, cacheDateStr))
    .limit(1);

  if (cached.length > 0) {
    const row = cached[0];
    const slides = row.slidesJson as Slide[];
    const officeDay: OfficeDayInfo = {
      season: row.liturgicalSeason,
      liturgicalYear: row.liturgicalYear,
      sundayLabel: (slides[0]?.metadata?.sundayLabel as string) ?? "",
      weekdayLabel: slides[0]?.content ?? "",
      properNumber: row.properNumber ?? null,
      feastName: row.feastName ?? null,
      isMajorFeast: !!(slides[0]?.metadata?.isMajorFeast),
      useAlleluia: !!(slides[0]?.metadata?.useAlleluia),
      totalSlides: slides.length,
    };
    return { slides, officeDay, fromCache: true };
  }

  // 2. Assemble
  const liturgicalDay = getOfficeDay(date);
  const { psalms, lesson1, lesson2 } = getLectionaryReadings(liturgicalDay);
  const { afterOT, afterNT } = getCanticles(liturgicalDay);

  // Determine text keys needed
  const openingSentenceKey = pickOpeningSentenceKey(
    liturgicalDay.season,
    date.getDate(),
  );

  let invitPsalmKey: string;
  if (liturgicalDay.invitatorySeason === "easter") {
    invitPsalmKey = "pascha_nostrum";
  } else if (
    liturgicalDay.invitatorySeason === "lent" ||
    liturgicalDay.invitatorySeason === "holy_week"
  ) {
    invitPsalmKey = "jubilate";
  } else {
    invitPsalmKey = "venite";
  }

  const suffragesKey = pickSuffragesKey(liturgicalDay.weekInSeason);
  const missionPrayerKey = pickMissionPrayerKey(liturgicalDay.dayOfWeek);

  const keysNeeded = [
    openingSentenceKey,
    "confession_text",
    "confession_absolution",
    invitPsalmKey,
    liturgicalDay.antiphonKey,
    afterOT,
    afterNT,
    "apostles_creed",
    "lords_prayer_contemporary",
    suffragesKey,
    liturgicalDay.collectKey,
    "collect_for_grace",
    missionPrayerKey,
    "general_thanksgiving",
  ];

  // Psalm keys for appointed psalms (parse psalm numbers from lectionary)
  const appointedPsalmNums = psalms
    .map((p) => {
      const num = parseInt(p.split(":")[0], 10);
      return isNaN(num) ? null : num;
    })
    .filter((n): n is number => n !== null);

  const psalmKeys = [
    ...new Set([
      invitPsalmKey === "venite"
        ? "psalm_95"
        : invitPsalmKey === "jubilate"
          ? "psalm_100"
          : null,
      ...appointedPsalmNums.map((n) => `psalm_${n}`),
    ].filter(Boolean)),
  ] as string[];

  // Fetch all BCP texts in two queries
  const [bcpRows, psalmRows, lesson1Result, lesson2Result] = await Promise.all([
    db
      .select()
      .from(bcpTextsTable)
      .where(inArray(bcpTextsTable.textKey, keysNeeded)),
    db
      .select()
      .from(bcpTextsTable)
      .where(inArray(bcpTextsTable.textKey, psalmKeys)),
    getLesson(lesson1, cacheDate),
    getLesson(lesson2, cacheDate),
  ]);

  // Build lookup map
  const texts: Record<string, { content: string; title: string; bcpReference: string | null; metadata: Record<string, unknown> }> = {};
  for (const row of [...bcpRows, ...psalmRows]) {
    texts[row.textKey] = {
      content: row.content,
      title: row.title,
      bcpReference: row.bcpReference ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    };
  }

  function getText(key: string): string {
    return texts[key]?.content ?? `[${key} — see BCP]`;
  }

  // ── Build slide array ──────────────────────────────────────────────────────

  const slides: Slide[] = [];
  let idx = 0;
  const id = () => `slide_${idx++}`;

  // SLIDE 1: Opening
  slides.push(
    slide(id(), "opening", "✨", "", liturgicalDay.weekdayLabel, {
      metadata: {
        season: liturgicalDay.season,
        seasonLabel: SEASON_LABELS[liturgicalDay.season] ?? liturgicalDay.season,
        liturgicalYear: liturgicalDay.liturgicalYear,
        date: date.toISOString(),
        sundayLabel: liturgicalDay.sundayLabel,
        weekdayLabel: liturgicalDay.weekdayLabel,
        isMajorFeast: liturgicalDay.isMajorFeast,
        useAlleluia: liturgicalDay.useAlleluia,
      },
    }),
  );

  // SLIDE 2: Opening Sentence
  slides.push(
    slide(id(), "opening_sentence", "📖", "OPENING SENTENCE", getText(openingSentenceKey), {
      bcpReference: "BCP p. 75",
    }),
  );

  // SLIDE 3: Confession
  slides.push(
    slide(id(), "confession", "🙏", "CONFESSION OF SIN", getText("confession_text"), {
      bcpReference: "BCP p. 79",
      metadata: { prompt: "Pause. Bring what you carry. 🌿" },
    }),
  );

  // SLIDE 4: Absolution
  slides.push(
    slide(id(), "absolution", "☀️", "ABSOLUTION", getText("confession_absolution"), {
      bcpReference: "BCP p. 80",
    }),
  );

  // SLIDE 5: Invitatory versicle
  const invitatoryLines: CallAndResponseLine[] = [
    { speaker: "officiant", text: "Lord, open our lips." },
    { speaker: "people", text: "And our mouth shall proclaim your praise." },
    {
      speaker: "both",
      text: "Glory to the Father, and to the Son, and to the Holy Spirit: as it was in the beginning, is now, and will be for ever. Amen.",
    },
  ];
  if (liturgicalDay.useAlleluia) {
    invitatoryLines.push({ speaker: "both", text: "Alleluia." });
  }

  slides.push(
    slide(id(), "invitatory", "🔔", "INVITATORY", "", {
      isCallAndResponse: true,
      callAndResponseLines: invitatoryLines,
      bcpReference: "BCP p. 80",
    }),
  );

  // Seasonal antiphon (if applicable)
  const antiphonText = getText(liturgicalDay.antiphonKey);
  if (antiphonText && !antiphonText.startsWith("[")) {
    slides.push(
      slide(id(), "invitatory", "🕊️", "ANTIPHON", antiphonText, {
        bcpReference: "BCP p. 80",
      }),
    );
  }

  // SLIDE 6: Invitatory Psalm
  const invitPsalmTitles: Record<string, string> = {
    venite: "VENITE · PSALM 95",
    jubilate: "JUBILATE · PSALM 100",
    pascha_nostrum: "PASCHA NOSTRUM",
  };
  const invitPsalmRefs: Record<string, string> = {
    venite: "BCP p. 82",
    jubilate: "BCP p. 82",
    pascha_nostrum: "BCP p. 83",
  };

  slides.push(
    slide(id(), "invitatory_psalm", "🎶", invitPsalmTitles[invitPsalmKey] ?? "VENITE", getText(invitPsalmKey), {
      bcpReference: invitPsalmRefs[invitPsalmKey] ?? "BCP p. 82",
      isScrollable: true,
      scrollHint: "↓ continue · tap when ready",
    }),
  );

  // SLIDES 7+: Appointed Psalms
  const gloriaPatri =
    "\nGlory to the Father, and to the Son, and to the Holy Spirit: as it was in the beginning, is now, and will be for ever. Amen.";

  for (const psalmNum of appointedPsalmNums) {
    const psalmKey = `psalm_${psalmNum}`;
    const psalmData = texts[psalmKey];
    const content = psalmData
      ? psalmData.content + gloriaPatri
      : `[Psalm ${psalmNum} — see BCP Psalter]${gloriaPatri}`;

    slides.push(
      slide(id(), "psalm", PSALM_EMOJI[psalmNum] ?? "📖", `PSALM ${psalmNum}`, content, {
        isScrollable: true,
        scrollHint: "↓ continue · tap when ready",
        metadata: psalmData?.metadata ?? {},
      }),
    );
  }

  // First Lesson
  slides.push(
    slide(id(), "lesson", "📜", "FIRST LESSON", lesson1Result.text + "\n\nHere ends the Reading.", {
      title: lesson1,
      isScrollable: true,
      scrollHint: "↓ continue · tap when ready",
      metadata: { reference: lesson1 },
    }),
  );

  // Canticle after OT
  const afterOTData = texts[afterOT];
  slides.push(
    slide(
      id(),
      "canticle",
      CANTICLE_EMOJI[afterOT] ?? "🌟",
      `CANTICLE · ${(afterOTData?.title ?? afterOT).toUpperCase()}`,
      getText(afterOT),
      {
        bcpReference: afterOTData?.bcpReference ?? null,
      },
    ),
  );

  // Second Lesson
  slides.push(
    slide(id(), "lesson", "✉️", "SECOND LESSON", lesson2Result.text + "\n\nHere ends the Reading.", {
      title: lesson2,
      isScrollable: true,
      scrollHint: "↓ continue · tap when ready",
      metadata: { reference: lesson2 },
    }),
  );

  // Canticle after NT
  const afterNTData = texts[afterNT];
  slides.push(
    slide(
      id(),
      "canticle",
      CANTICLE_EMOJI[afterNT] ?? "🌟",
      `CANTICLE · ${(afterNTData?.title ?? afterNT).toUpperCase()}`,
      getText(afterNT),
      {
        bcpReference: afterNTData?.bcpReference ?? null,
      },
    ),
  );

  // Creed
  slides.push(
    slide(id(), "creed", "✝️", "THE APOSTLES' CREED", getText("apostles_creed"), {
      bcpReference: "BCP p. 96",
      metadata: { prompt: "We say together what we believe." },
    }),
  );

  // Lord's Prayer
  slides.push(
    slide(id(), "lords_prayer", "🙏", "THE LORD'S PRAYER", getText("lords_prayer_contemporary"), {
      bcpReference: "BCP p. 97",
    }),
  );

  // Suffrages
  const suffrageText = getText(suffragesKey);
  const suffrageLabel = suffragesKey === "suffrages_a" ? "A" : "B";
  slides.push(
    slide(id(), "suffrages", "🕊️", `THE PRAYERS · SUFFRAGES ${suffrageLabel}`, suffrageText, {
      bcpReference: "BCP p. 97",
      isCallAndResponse: true,
      callAndResponseLines: parseSuffrages(suffrageText),
    }),
  );

  // Collect of the Day
  const collectData = texts[liturgicalDay.collectKey];
  slides.push(
    slide(id(), "collect", "📅", "COLLECT OF THE DAY", getText(liturgicalDay.collectKey), {
      title: liturgicalDay.sundayLabel,
      bcpReference: collectData?.bcpReference ?? "BCP p. 211",
    }),
  );

  // Collect for Grace
  slides.push(
    slide(id(), "collect", "🌿", "A COLLECT FOR GRACE", getText("collect_for_grace"), {
      bcpReference: "BCP p. 100",
    }),
  );

  // Prayer for Mission
  slides.push(
    slide(id(), "prayer_for_mission", "🌍", "A PRAYER FOR MISSION", getText(missionPrayerKey), {
      bcpReference: "BCP p. 100",
    }),
  );

  // General Thanksgiving
  slides.push(
    slide(id(), "general_thanksgiving", "🌾", "THE GENERAL THANKSGIVING", getText("general_thanksgiving"), {
      bcpReference: "BCP p. 101",
      metadata: { prompt: "This is often said aloud together." },
    }),
  );

  // Closing
  slides.push(
    slide(id(), "closing", "🙏", "", "Morning Prayer", {
      metadata: {
        date: date.toISOString(),
      },
    }),
  );

  // 3. Cache result
  try {
    await db
      .insert(morningPrayerCacheTable)
      .values({
        cacheDate: cacheDateStr,
        liturgicalYear: liturgicalDay.liturgicalYear,
        liturgicalSeason: liturgicalDay.season,
        properNumber: liturgicalDay.properNumber,
        feastName: liturgicalDay.feastName,
        slidesJson: slides as unknown as Record<string, unknown>[],
        assembledByUserId: userId,
      })
      .onConflictDoNothing();
  } catch (err) {
    console.error("Failed to cache morning prayer:", err);
  }

  const officeDay: OfficeDayInfo = {
    season: liturgicalDay.season,
    liturgicalYear: liturgicalDay.liturgicalYear,
    sundayLabel: liturgicalDay.sundayLabel,
    weekdayLabel: liturgicalDay.weekdayLabel,
    properNumber: liturgicalDay.properNumber,
    feastName: liturgicalDay.feastName,
    isMajorFeast: liturgicalDay.isMajorFeast,
    useAlleluia: liturgicalDay.useAlleluia,
    totalSlides: slides.length,
  };

  return { slides, officeDay, fromCache: false };
}
