/**
 * Lectionary Service — 1979 Episcopal BCP Daily Office Lectionary
 *
 * Returns the appointed psalms and scripture lessons for any given
 * liturgical day from the two-year cycle.
 */

import { lectionary } from "../data/lectionary1979";
import type { LiturgicalDay } from "./liturgicalCalendar";

export interface LectionaryReadings {
  psalms: string[];       // Psalm numbers as strings, e.g. ["95", "100"]
  lesson1: string;        // OT lesson reference
  lesson2: string;        // NT/Gospel lesson reference
  weekKey: string;        // The key used for lookup
}

export function getLectionaryReadings(
  officeDay: LiturgicalDay,
): LectionaryReadings {
  const key = officeDay.lectionaryWeekKey;
  const entry = lectionary[key];

  if (!entry) {
    // Fallback: try to find the nearest available entry
    console.warn(`No lectionary entry for key: ${key}`);
    return {
      psalms: ["95"],
      lesson1: "Isaiah 55:1-11",
      lesson2: "Romans 8:1-11",
      weekKey: key,
    };
  }

  const isYear1 = officeDay.liturgicalYear === 1;

  return {
    psalms: entry.psalms_mp,
    lesson1: isYear1 ? entry.lesson1_y1 : entry.lesson1_y2,
    lesson2: isYear1 ? entry.lesson2_y1 : entry.lesson2_y2,
    weekKey: key,
  };
}
