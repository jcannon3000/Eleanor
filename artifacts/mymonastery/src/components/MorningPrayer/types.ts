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

export interface MemberPresence {
  name: string;
  email: string;
  loggedAt: string | null;
}
