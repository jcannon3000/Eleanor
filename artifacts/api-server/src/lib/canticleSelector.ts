/**
 * Canticle Selector — BCP p. 144 Table of Suggested Canticles
 *
 * Returns the canticle textKeys for after the OT and NT lessons
 * at Morning Prayer Rite II, based on day of week and season.
 */

import type { LiturgicalDay } from "./liturgicalCalendar";

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

type SeasonMap = Record<string, string>;

const CANTICLE_TABLE: Record<
  string,
  { afterOT: SeasonMap; afterNT: SeasonMap }
> = {
  sunday: {
    afterOT: {
      default: "canticle_16", // Benedictus Dominus Deus
      advent: "canticle_11", // Surge, illuminare
      lent: "canticle_14", // Kyrie Pantokrator
      easter: "canticle_8", // Cantemus Domino
    },
    afterNT: {
      default: "canticle_21", // Te Deum
      advent: "canticle_16", // Benedictus Dominus Deus
      lent: "canticle_16", // Benedictus Dominus Deus
    },
  },
  monday: {
    afterOT: { default: "canticle_9" }, // Ecce, Deus
    afterNT: { default: "canticle_19" }, // Magna et mirabilia
  },
  tuesday: {
    afterOT: { default: "canticle_13" }, // Benedictus es
    afterNT: { default: "canticle_18" }, // Dignus es
  },
  wednesday: {
    afterOT: {
      default: "canticle_11", // Surge, illuminare
      lent: "canticle_14", // Kyrie Pantokrator
    },
    afterNT: { default: "canticle_16" }, // Benedictus Dominus Deus
  },
  thursday: {
    afterOT: { default: "canticle_8" }, // Cantemus Domino
    afterNT: {
      default: "canticle_20", // Gloria in excelsis
      advent: "canticle_19", // Magna et mirabilia
      lent: "canticle_19", // Magna et mirabilia
    },
  },
  friday: {
    afterOT: {
      default: "canticle_10", // Quærite Dominum
      lent: "canticle_14", // Kyrie Pantokrator
    },
    afterNT: { default: "canticle_18" }, // Dignus es
  },
  saturday: {
    afterOT: { default: "canticle_12" }, // Benedicite
    afterNT: { default: "canticle_19" }, // Magna et mirabilia
  },
};

function pickCanticle(map: SeasonMap, season: string): string {
  // Map liturgical seasons to the keys used in the canticle table
  const seasonKey =
    season === "holy_week"
      ? "lent"
      : season === "season_after_pentecost"
        ? "default"
        : season;
  return map[seasonKey] ?? map["default"];
}

export function getCanticles(officeDay: LiturgicalDay): {
  afterOT: string;
  afterNT: string;
} {
  // Principal Feasts and Feasts of our Lord override
  if (officeDay.isMajorFeast) {
    return {
      afterOT: "canticle_16", // Benedictus Dominus Deus
      afterNT: "canticle_21", // Te Deum
    };
  }

  const dayKey = DAY_KEYS[officeDay.dayOfWeek];
  const entry = CANTICLE_TABLE[dayKey];

  return {
    afterOT: pickCanticle(entry.afterOT, officeDay.season),
    afterNT: pickCanticle(entry.afterNT, officeDay.season),
  };
}
