/**
 * BCP Texts Seed Script
 *
 * Fetches liturgical texts from bcponline.org and upserts them into
 * the bcp_texts table. Run once to populate; safe to re-run (upserts).
 *
 * Usage:
 *   pnpm tsx src/seeds/bcpTexts.ts
 *
 * No external dependencies beyond @workspace/db and Node fetch.
 * 500ms delay between requests to be polite to bcponline.org.
 */

import { db, bcpTextsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Strip HTML tags and normalize whitespace from a chunk of HTML.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, "\u201c")
    .replace(/&#8221;/g, "\u201d")
    .replace(/&#8212;/g, "—")
    .replace(/&#8211;/g, "–")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n")
    .trim();
}

/**
 * Fetch a URL and return the raw HTML text.
 */
async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Eleanor/1.0 BCP Seed Script" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

/**
 * Upsert a single bcp_texts row.
 */
async function upsert(row: {
  textKey: string;
  category: string;
  title: string;
  bcpReference?: string;
  content: string;
  seasonRestriction?: string;
  metadata?: Record<string, unknown>;
}) {
  await db
    .insert(bcpTextsTable)
    .values({
      textKey: row.textKey,
      category: row.category,
      title: row.title,
      bcpReference: row.bcpReference ?? null,
      content: row.content,
      seasonRestriction: row.seasonRestriction ?? null,
      metadata: row.metadata ?? null,
    })
    .onConflictDoUpdate({
      target: bcpTextsTable.textKey,
      set: {
        content: sql`excluded.content`,
        title: sql`excluded.title`,
        bcpReference: sql`excluded.bcp_reference`,
        seasonRestriction: sql`excluded.season_restriction`,
        metadata: sql`excluded.metadata`,
      },
    });
}

/* ------------------------------------------------------------------ */
/*  Static BCP texts (these don't change — defined inline)             */
/* ------------------------------------------------------------------ */

/**
 * Core liturgical texts that are short enough to define inline and
 * aren't scraped. These come directly from BCP Rite II Morning Prayer.
 */
async function seedStaticTexts() {
  console.log("Seeding static liturgical texts...");

  const texts: Array<Parameters<typeof upsert>[0]> = [
    // ── Opening sentences ───────────────────────────────────────────
    {
      textKey: "opening_sentence_advent_1",
      category: "opening_sentence",
      title: "Opening Sentence — Advent",
      bcpReference: "BCP p. 75",
      seasonRestriction: "advent",
      content:
        "Watch, for you do not know when the master of the house will come, in the evening, or at midnight, or at cockcrow, or in the morning; lest he come suddenly and find you asleep. — Mark 13:35,36",
    },
    {
      textKey: "opening_sentence_advent_2",
      category: "opening_sentence",
      title: "Opening Sentence — Advent",
      bcpReference: "BCP p. 75",
      seasonRestriction: "advent",
      content:
        "In the wilderness prepare the way of the Lord, make straight in the desert a highway for our God. — Isaiah 40:3",
    },
    {
      textKey: "opening_sentence_advent_3",
      category: "opening_sentence",
      title: "Opening Sentence — Advent",
      bcpReference: "BCP p. 75",
      seasonRestriction: "advent",
      content:
        "The glory of the Lord shall be revealed, and all flesh shall see it together. — Isaiah 40:5",
    },
    {
      textKey: "opening_sentence_christmas_1",
      category: "opening_sentence",
      title: "Opening Sentence — Christmas",
      bcpReference: "BCP p. 75",
      seasonRestriction: "christmas",
      content:
        "Behold, I bring you good news of a great joy which will come to all the people; for to you is born this day in the city of David, a Savior, who is Christ the Lord. — Luke 2:10,11",
    },
    {
      textKey: "opening_sentence_christmas_2",
      category: "opening_sentence",
      title: "Opening Sentence — Christmas",
      bcpReference: "BCP p. 75",
      seasonRestriction: "christmas",
      content:
        "Behold, the dwelling of God is with men. He will dwell with them, and they shall be his people, and God himself will be with them, and be their God. — Revelation 21:3",
    },
    {
      textKey: "opening_sentence_epiphany_1",
      category: "opening_sentence",
      title: "Opening Sentence — Epiphany",
      bcpReference: "BCP p. 76",
      seasonRestriction: "epiphany",
      content:
        "Nations shall come to your light, and kings to the brightness of your rising. — Isaiah 60:3",
    },
    {
      textKey: "opening_sentence_epiphany_2",
      category: "opening_sentence",
      title: "Opening Sentence — Epiphany",
      bcpReference: "BCP p. 76",
      seasonRestriction: "epiphany",
      content:
        "I will give you as a light to the nations, that my salvation may reach to the end of the earth. — Isaiah 49:6b",
    },
    {
      textKey: "opening_sentence_epiphany_3",
      category: "opening_sentence",
      title: "Opening Sentence — Epiphany",
      bcpReference: "BCP p. 76",
      seasonRestriction: "epiphany",
      content:
        "Arise, shine; for your light has come, and the glory of the Lord has risen upon you. — Isaiah 60:1",
    },
    {
      textKey: "opening_sentence_lent_1",
      category: "opening_sentence",
      title: "Opening Sentence — Lent",
      bcpReference: "BCP p. 76",
      seasonRestriction: "lent",
      content:
        "If we say we have no sin, we deceive ourselves, and the truth is not in us; but if we confess our sins, God, who is faithful and just, will forgive our sins and cleanse us from all unrighteousness. — 1 John 1:8,9",
    },
    {
      textKey: "opening_sentence_lent_2",
      category: "opening_sentence",
      title: "Opening Sentence — Lent",
      bcpReference: "BCP p. 76",
      seasonRestriction: "lent",
      content:
        "Rend your hearts and not your garments. Return to the Lord your God, for he is gracious and merciful, slow to anger and abounding in steadfast love, and repents of evil. — Joel 2:13",
    },
    {
      textKey: "opening_sentence_lent_3",
      category: "opening_sentence",
      title: "Opening Sentence — Lent",
      bcpReference: "BCP p. 76",
      seasonRestriction: "lent",
      content:
        "I will arise and go to my father, and I will say to him, Father, I have sinned against heaven and before you; I am no more worthy to be called your son. — Luke 15:18,19",
    },
    {
      textKey: "opening_sentence_lent_4",
      category: "opening_sentence",
      title: "Opening Sentence — Lent",
      bcpReference: "BCP p. 76",
      seasonRestriction: "lent",
      content:
        "To the Lord our God belong mercy and forgiveness, because we have rebelled against him and have not obeyed the voice of the Lord our God. — Daniel 9:9,10",
    },
    {
      textKey: "opening_sentence_lent_5",
      category: "opening_sentence",
      title: "Opening Sentence — Lent",
      bcpReference: "BCP p. 76",
      seasonRestriction: "lent",
      content:
        "The Lord is merciful and gracious, slow to anger and abounding in steadfast love. As a father pities his children, so the Lord pities those who fear him. — Psalm 103:8,13",
    },
    {
      textKey: "opening_sentence_holyweek_1",
      category: "opening_sentence",
      title: "Opening Sentence — Holy Week",
      bcpReference: "BCP p. 76",
      seasonRestriction: "holy_week",
      content:
        "Is it nothing to you, all you who pass by? Look and see if there is any sorrow like my sorrow which was brought upon me, which the Lord inflicted on the day of his fierce anger. — Lamentations 1:12",
    },
    {
      textKey: "opening_sentence_holyweek_2",
      category: "opening_sentence",
      title: "Opening Sentence — Holy Week",
      bcpReference: "BCP p. 76",
      seasonRestriction: "holy_week",
      content:
        "All we like sheep have gone astray; we have turned every one to his own way; and the Lord has laid on him the iniquity of us all. — Isaiah 53:6",
    },
    {
      textKey: "opening_sentence_easter_1",
      category: "opening_sentence",
      title: "Opening Sentence — Easter",
      bcpReference: "BCP p. 76",
      seasonRestriction: "easter",
      content:
        "Alleluia! The Lord is risen indeed: Come let us adore him. Alleluia!",
    },
    {
      textKey: "opening_sentence_easter_2",
      category: "opening_sentence",
      title: "Opening Sentence — Easter",
      bcpReference: "BCP p. 76",
      seasonRestriction: "easter",
      content:
        "On this day the Lord has acted; we will rejoice and be glad in it. — Psalm 118:24",
    },
    {
      textKey: "opening_sentence_easter_3",
      category: "opening_sentence",
      title: "Opening Sentence — Easter",
      bcpReference: "BCP p. 76",
      seasonRestriction: "easter",
      content:
        "If then you have been raised with Christ, seek the things that are above, where Christ is, seated at the right hand of God. — Colossians 3:1",
    },
    {
      textKey: "opening_sentence_easter_4",
      category: "opening_sentence",
      title: "Opening Sentence — Easter",
      bcpReference: "BCP p. 76",
      seasonRestriction: "easter",
      content:
        "Christ is risen from the dead, trampling down death by death, and giving life to those in the tomb.",
    },
    {
      textKey: "opening_sentence_easter_5",
      category: "opening_sentence",
      title: "Opening Sentence — Easter",
      bcpReference: "BCP p. 76",
      seasonRestriction: "easter",
      content:
        "Thanks be to God, who gives us the victory through our Lord Jesus Christ. — 1 Corinthians 15:57",
    },
    {
      textKey: "opening_sentence_anytime_1",
      category: "opening_sentence",
      title: "Opening Sentence",
      bcpReference: "BCP p. 76",
      content:
        "Grace to you and peace from God our Father and the Lord Jesus Christ. — Philippians 1:2",
    },
    {
      textKey: "opening_sentence_anytime_2",
      category: "opening_sentence",
      title: "Opening Sentence",
      bcpReference: "BCP p. 76",
      content:
        "I was glad when they said to me, \"Let us go to the house of the Lord.\" — Psalm 122:1",
    },
    {
      textKey: "opening_sentence_anytime_3",
      category: "opening_sentence",
      title: "Opening Sentence",
      bcpReference: "BCP p. 76",
      content:
        "Let the words of my mouth and the meditation of my heart be acceptable in your sight, O Lord, my strength and my redeemer. — Psalm 19:14",
    },
    {
      textKey: "opening_sentence_anytime_4",
      category: "opening_sentence",
      title: "Opening Sentence",
      bcpReference: "BCP p. 76",
      content:
        "Send out your light and your truth, that they may lead me, and bring me to your holy hill and to your dwelling. — Psalm 43:3",
    },
    {
      textKey: "opening_sentence_anytime_5",
      category: "opening_sentence",
      title: "Opening Sentence",
      bcpReference: "BCP p. 76",
      content:
        "The Lord is in his holy temple; let all the earth keep silence before him. — Habakkuk 2:20",
    },
    {
      textKey: "opening_sentence_anytime_6",
      category: "opening_sentence",
      title: "Opening Sentence",
      bcpReference: "BCP p. 76",
      content:
        "O worship the Lord in the beauty of holiness; let the whole earth stand in awe of him. — Psalm 96:9",
    },
    {
      textKey: "opening_sentence_anytime_7",
      category: "opening_sentence",
      title: "Opening Sentence",
      bcpReference: "BCP p. 76",
      content:
        "Seek him who made the Pleiades and Orion, and turns deep darkness into the morning, and darkens the day into night; who calls for the waters of the sea and pours them out upon the surface of the earth: The Lord is his name. — Amos 5:8",
    },

    // ── Confession & Absolution ──────────────────────────────────────
    {
      textKey: "confession_text",
      category: "confession",
      title: "Confession of Sin",
      bcpReference: "BCP p. 79",
      content:
        "Most merciful God,\nwe confess that we have sinned against you\nin thought, word, and deed,\nby what we have done,\nand by what we have left undone.\nWe have not loved you with our whole heart;\nwe have not loved our neighbors as ourselves.\nWe are truly sorry and we humbly repent.\nFor the sake of your Son Jesus Christ,\nhave mercy on us and forgive us;\nthat we may delight in your will,\nand walk in your ways,\nto the glory of your Name. Amen.",
    },
    {
      textKey: "confession_absolution",
      category: "absolution",
      title: "Absolution",
      bcpReference: "BCP p. 80",
      content:
        "Almighty God have mercy on you, forgive you all your sins through our Lord Jesus Christ, strengthen you in all goodness, and by the power of the Holy Spirit keep you in eternal life. Amen.",
    },

    // ── Invitatory psalms ────────────────────────────────────────────
    {
      textKey: "venite",
      category: "invitatory",
      title: "Venite · Psalm 95",
      bcpReference: "BCP p. 82",
      content:
        "Come, let us sing to the Lord; *\n  let us shout for joy to the Rock of our salvation.\nLet us come before his presence with thanksgiving *\n  and raise a loud shout to him with psalms.\n\nFor the Lord is a great God, *\n  and a great King above all gods.\nIn his hand are the caverns of the earth, *\n  and the heights of the hills are his also.\nThe sea is his, for he made it, *\n  and his hands have molded the dry land.\n\nCome, let us bow down, and bend the knee, *\n  and kneel before the Lord our Maker.\nFor he is our God,\nand we are the people of his pasture and the sheep of his hand. *\n  Oh, that today you would hearken to his voice!",
    },
    {
      textKey: "jubilate",
      category: "invitatory",
      title: "Jubilate · Psalm 100",
      bcpReference: "BCP p. 82",
      content:
        "Be joyful in the Lord, all you lands; *\n  serve the Lord with gladness\n  and come before his presence with a song.\n\nKnow this: The Lord himself is God; *\n  he himself has made us, and we are his;\n  we are his people and the sheep of his pasture.\n\nEnter his gates with thanksgiving;\n  go into his courts with praise; *\n  give thanks to him and call upon his Name.\n\nFor the Lord is good;\n  his mercy is everlasting; *\n  and his faithfulness endures from age to age.",
    },
    {
      textKey: "pascha_nostrum",
      category: "invitatory",
      title: "Pascha Nostrum",
      bcpReference: "BCP p. 83",
      seasonRestriction: "easter",
      content:
        "Christ our Passover is sacrificed for us; *\n  therefore let us keep the feast,\n\nNot with the old leaven, the leaven of malice and evil, *\n  but with the unleavened bread of sincerity and truth. Alleluia.\n\nChrist being raised from the dead will never die again; *\n  death no longer has dominion over him.\n\nThe death that he died, he died to sin, once for all; *\n  but the life he lives, he lives to God.\n\nSo also consider yourselves dead to sin, *\n  and alive to God in Jesus Christ our Lord. Alleluia.\n\nChrist has been raised from the dead, *\n  the first fruits of those who have fallen asleep.\n\nFor since by a man came death, *\n  by a man has come also the resurrection of the dead.\n\nFor as in Adam all die, *\n  so also in Christ shall all be made alive. Alleluia.",
    },

    // ── Antiphons ────────────────────────────────────────────────────
    {
      textKey: "antiphon_advent",
      category: "antiphon",
      title: "Antiphon — Advent",
      bcpReference: "BCP p. 80",
      seasonRestriction: "advent",
      content: "Our King and Savior now draws near: Come let us adore him.",
    },
    {
      textKey: "antiphon_christmas",
      category: "antiphon",
      title: "Antiphon — Christmas",
      bcpReference: "BCP p. 80",
      seasonRestriction: "christmas",
      content: "Alleluia. To us a child is born: Come let us adore him. Alleluia.",
    },
    {
      textKey: "antiphon_epiphany",
      category: "antiphon",
      title: "Antiphon — Epiphany",
      bcpReference: "BCP p. 80",
      seasonRestriction: "epiphany",
      content: "The Lord has manifested his glory: Come let us adore him.",
    },
    {
      textKey: "antiphon_lent",
      category: "antiphon",
      title: "Antiphon — Lent",
      bcpReference: "BCP p. 80",
      seasonRestriction: "lent",
      content: "The Lord is full of compassion and mercy: Come let us adore him.",
    },
    {
      textKey: "antiphon_holyweek",
      category: "antiphon",
      title: "Antiphon — Holy Week",
      bcpReference: "BCP p. 80",
      seasonRestriction: "holy_week",
      content: "Christ humbled himself and became obedient to death: Come let us adore him.",
    },
    {
      textKey: "antiphon_easter",
      category: "antiphon",
      title: "Antiphon — Easter",
      bcpReference: "BCP p. 80",
      seasonRestriction: "easter",
      content: "Alleluia. The Lord is risen indeed: Come let us adore him. Alleluia.",
    },
    {
      textKey: "antiphon_none",
      category: "antiphon",
      title: "Antiphon (none)",
      content: "",
    },

    // ── Canticles after OT ───────────────────────────────────────────
    {
      textKey: "canticle_8",
      category: "canticle",
      title: "Canticle 8 — The Song of Moses",
      bcpReference: "BCP p. 85",
      content:
        "I will sing to the Lord, for he is lofty and uplifted; *\n  the horse and its rider has he hurled into the sea.\nThe Lord is my strength and my refuge; *\n  the Lord has become my Savior.\nThis is my God and I will praise him, *\n  the God of my people and I will exalt him.\nThe Lord is a mighty warrior; *\n  Yahweh is his Name.\nThe chariots of Pharaoh and his army has he hurled into the sea; *\n  the finest of those who bear armor have been drowned in the Red Sea.\nThe fathomless deep has overwhelmed them; *\n  they sank into the depths like a stone.\nYour right hand, O Lord, is glorious in might; *\n  your right hand, O Lord, has overthrown the enemy.\nWho can be compared with you, O Lord, among the gods? *\n  who is like you, glorious in holiness,\n  awesome in renown, and worker of wonders?\nYou stretched forth your right hand; *\n  the earth swallowed them up.\nWith your constant love you led the people you redeemed; *\n  with your might you brought them in safety to your holy dwelling.\nYou will bring them in and plant them *\n  on the mount of your possession,\nThe resting-place you have made for yourself, O Lord, *\n  the sanctuary, O Lord, that your hand has established.\nThe Lord shall reign *\n  for ever and for ever.",
    },
    {
      textKey: "canticle_9",
      category: "canticle",
      title: "Canticle 9 — The First Song of Isaiah",
      bcpReference: "BCP p. 86",
      content:
        "Surely, it is God who saves me; *\n  I will trust in him and not be afraid.\nFor the Lord is my stronghold and my sure defense, *\n  and he will be my Savior.\nTherefore you shall draw water with rejoicing *\n  from the springs of salvation.\nAnd on that day you shall say, *\n  Give thanks to the Lord and call upon his Name;\nMake his deeds known among the peoples; *\n  see that they remember that his Name is exalted.\nSing the praises of the Lord, for he has done great things, *\n  and this is known in all the world.\nCry aloud, inhabitants of Zion, ring out your joy, *\n  for the great one in the midst of you is the Holy One of Israel.",
    },
    {
      textKey: "canticle_10",
      category: "canticle",
      title: "Canticle 10 — The Second Song of Isaiah",
      bcpReference: "BCP p. 86",
      content:
        "Seek the Lord while he wills to be found; *\n  call upon him when he draws near.\nLet the wicked forsake their ways *\n  and the evil ones their thoughts;\nAnd let them turn to the Lord, and he will have compassion, *\n  and to our God, for he will richly pardon.\nFor my thoughts are not your thoughts, *\n  nor your ways my ways, says the Lord.\nFor as the heavens are higher than the earth, *\n  so are my ways higher than your ways,\n  and my thoughts than your thoughts.\nFor as rain and snow fall from the heavens *\n  and return not again, but water the earth,\nBringing forth life and giving growth, *\n  seed for sowing and bread for eating,\nSo is my word that goes forth from my mouth; *\n  it will not return to me empty;\nBut it will accomplish that which I have purposed, *\n  and prosper in that for which I sent it.",
    },
    {
      textKey: "canticle_11",
      category: "canticle",
      title: "Canticle 11 — The Third Song of Isaiah",
      bcpReference: "BCP p. 87",
      content:
        "Arise, shine, for your light has come, *\n  and the glory of the Lord has dawned upon you.\nFor behold, darkness covers the land; *\n  deep gloom enshrouds the peoples.\nBut over you the Lord will rise, *\n  and his glory will appear upon you.\nNations will stream to your light, *\n  and kings to the brightness of your dawning.\nYour gates will always be open; *\n  by day or night they will never be shut.\nThey will call you, The City of the Lord, *\n  The Zion of the Holy One of Israel.\nViolence will no more be heard in your land, *\n  ruin or destruction within your borders.\nYou will call your walls, Salvation, *\n  and all your portals, Praise.\nThe sun will no more be your light by day; *\n  by night you will not need the brightness of the moon.\nThe Lord will be your everlasting light, *\n  and your God will be your glory.",
    },
    {
      textKey: "canticle_12",
      category: "canticle",
      title: "Canticle 12 — A Song of Creation",
      bcpReference: "BCP p. 88",
      content:
        "Glorify the Lord, all you works of the Lord, *\n  praise him and highly exalt him for ever.\nIn the firmament of his power, glorify the Lord, *\n  praise him and highly exalt him for ever.\n\nGlorify the Lord, you angels and all powers of the Lord, *\n  O heavens and all waters above the heavens.\nSun and moon and stars of the sky, glorify the Lord, *\n  praise him and highly exalt him for ever.\n\nGlorify the Lord, every shower of rain and fall of dew, *\n  all winds and fire and heat.\nWinter and Summer, glorify the Lord, *\n  praise him and highly exalt him for ever.\n\nGlorify the Lord, O chill and cold, *\n  drops of dew and flakes of snow.\nFrost and cold, ice and sleet, glorify the Lord, *\n  praise him and highly exalt him for ever.\n\nGlorify the Lord, O nights and days, *\n  O shining light and enfolding dark.\nStorm clouds and thunderbolts, glorify the Lord, *\n  praise him and highly exalt him for ever.\n\nLet the earth glorify the Lord, *\n  praise him and highly exalt him for ever.\nGlorify the Lord, O mountains and hills,\n  and all that grows upon the earth, *\n  praise him and highly exalt him for ever.\n\nGlorify the Lord, O springs of water, seas, and streams, *\n  O whales and all that move in the waters.\nAll birds of the air, glorify the Lord, *\n  praise him and highly exalt him for ever.\n\nGlorify the Lord, O beasts of the wild, *\n  and all you flocks and herds.\nO men and women everywhere, glorify the Lord, *\n  praise him and highly exalt him for ever.\n\nLet the people of God glorify the Lord, *\n  praise him and highly exalt him for ever.\nGlorify the Lord, O priests and servants of the Lord, *\n  praise him and highly exalt him for ever.\n\nGlorify the Lord, O spirits and souls of the righteous, *\n  praise him and highly exalt him for ever.\nYou that are holy and humble of heart, glorify the Lord, *\n  praise him and highly exalt him for ever.\n\nLet us glorify the Lord: Father, Son, and Holy Spirit; *\n  praise him and highly exalt him for ever.\nIn the firmament of his power, glorify the Lord, *\n  praise him and highly exalt him for ever.",
    },
    {
      textKey: "canticle_13",
      category: "canticle",
      title: "Canticle 13 — A Song of Praise",
      bcpReference: "BCP p. 90",
      content:
        "Glory to you, Lord God of our fathers; *\n  you are worthy of praise; glory to you.\nGlory to you for the radiance of your holy Name; *\n  we will praise you and highly exalt you for ever.\n\nGlory to you in the splendor of your temple; *\n  on the throne of your majesty, glory to you.\nGlory to you, seated between the Cherubim; *\n  we will praise you and highly exalt you for ever.\n\nGlory to you, beholding the depths; *\n  in the high vault of heaven, glory to you.\nGlory to you, Father, Son, and Holy Spirit; *\n  we will praise you and highly exalt you for ever.",
    },
    {
      textKey: "canticle_14",
      category: "canticle",
      title: "Canticle 14 — A Song of Penitence",
      bcpReference: "BCP p. 90",
      seasonRestriction: "lent",
      content:
        "O Lord and Ruler of the hosts of heaven, *\n  God of Abraham, Isaac, and Jacob,\n  and of all their righteous offspring:\nYou made the heavens and the earth, *\n  with all their vast array.\nAll things quake with fear at your presence; *\n  they tremble because of your power.\nBut your merciful promise is beyond all measure; *\n  it surpasses all that our minds can fathom.\nO Lord, you are full of compassion, *\n  long-suffering, and abounding in mercy.\nYou hold back your hand; *\n  you do not punish as we deserve.\nIn your great goodness, Lord, *\n  you have promised forgiveness to sinners,\n  that they may repent of their sin and be saved.\nAnd now, O Lord, I bend the knee of my heart, *\n  and make my appeal, sure of your gracious goodness.\nI have sinned, O Lord, I have sinned, *\n  and I know my wickedness only too well.\nTherefore I make this prayer to you: *\n  Forgive me, Lord, forgive me.\nDo not let me perish in my sin, *\n  nor condemn me to the depths of the earth.\nFor you, O Lord, are the God of those who repent, *\n  and in me you will show forth your goodness.\nUnworthy as I am, you will save me,\n  in accordance with your great mercy, *\n  and I will praise you without ceasing all the days of my life.\nFor all the powers of heaven sing your praises, *\n  and yours is the glory to ages of ages. Amen.",
    },

    // ── Canticles after NT ───────────────────────────────────────────
    {
      textKey: "canticle_16",
      category: "canticle",
      title: "Canticle 16 — The Song of Zechariah (Benedictus)",
      bcpReference: "BCP p. 92",
      content:
        "Blessed be the Lord, the God of Israel; *\n  he has come to his people and set them free.\nHe has raised up for us a mighty savior, *\n  born of the house of his servant David.\nThrough his holy prophets he promised of old,\n  that he would save us from our enemies, *\n  from the hands of all who hate us.\nHe promised to show mercy to our fathers *\n  and to remember his holy covenant.\nThis was the oath he swore to our father Abraham, *\n  to set us free from the hands of our enemies,\nFree to worship him without fear, *\n  holy and righteous in his sight\n  all the days of our life.\nYou, my child, shall be called the prophet of the Most High, *\n  for you will go before the Lord to prepare his way,\nTo give his people knowledge of salvation *\n  by the forgiveness of their sins.\nIn the tender compassion of our God *\n  the dawn from on high shall break upon us,\nTo shine on those who dwell in darkness and the shadow of death, *\n  and to guide our feet into the way of peace.",
    },
    {
      textKey: "canticle_18",
      category: "canticle",
      title: "Canticle 18 — A Song to the Lamb",
      bcpReference: "BCP p. 93",
      content:
        "Splendor and honor and kingly power *\n  are yours by right, O Lord our God,\nFor you created everything that is, *\n  and by your will they were created and have their being;\nAnd yours by right, O Lamb that was slain, *\n  for with your blood you have redeemed for God,\nFrom every family, language, people, and nation, *\n  a kingdom of priests to serve our God.\nAnd so, to him who sits upon the throne, *\n  and to Christ the Lamb,\nBe worship and praise, dominion and splendor, *\n  for ever and for ever more.",
    },
    {
      textKey: "canticle_19",
      category: "canticle",
      title: "Canticle 19 — The Song of the Redeemed",
      bcpReference: "BCP p. 94",
      content:
        "O ruler of the universe, Lord God,\n  great deeds are they that you have done, *\n  surpassing human understanding.\nYour ways are ways of righteousness and truth, *\n  O King of all the ages.\nWho can fail to do you homage, Lord,\n  and sing the praises of your Name? *\n  for you only are the Holy One.\nAll nations will draw near and fall down before you, *\n  because your just and holy works have been revealed.",
    },
    {
      textKey: "canticle_20",
      category: "canticle",
      title: "Canticle 20 — Glory to God (Gloria in Excelsis)",
      bcpReference: "BCP p. 94",
      content:
        "Glory to God in the highest,\n  and peace to his people on earth.\n\nLord God, heavenly King,\nalmighty God and Father,\n  we worship you, we give you thanks,\n  we praise you for your glory.\n\nLord Jesus Christ, only Son of the Father,\nLord God, Lamb of God,\nyou take away the sin of the world:\n  have mercy on us;\nyou are seated at the right hand of the Father:\n  receive our prayer.\n\nFor you alone are the Holy One,\nyou alone are the Lord,\nyou alone are the Most High,\n  Jesus Christ,\n  with the Holy Spirit,\n  in the glory of God the Father. Amen.",
    },
    {
      textKey: "canticle_21",
      category: "canticle",
      title: "Canticle 21 — You Are God (Te Deum Laudamus)",
      bcpReference: "BCP p. 95",
      content:
        "You are God: we praise you;\nYou are the Lord: we acclaim you;\nYou are the eternal Father:\n  All creation worships you.\nTo you all angels, all the powers of heaven,\n  Cherubim and Seraphim, sing in endless praise:\n  Holy, holy, holy Lord, God of power and might,\n  heaven and earth are full of your glory.\nThe glorious company of apostles praise you.\nThe noble fellowship of prophets praise you.\nThe white-robed army of martyrs praise you.\nThroughout the world the holy Church acclaims you;\n  Father, of majesty unbounded,\n  your true and only Son, worthy of all worship,\n  and the Holy Spirit, advocate and guide.\nYou, Christ, are the king of glory,\n  the eternal Son of the Father.\nWhen you became man to set us free\n  you did not shun the Virgin's womb.\nYou overcame the sting of death\n  and opened the kingdom of heaven to all believers.\nYou are seated at God's right hand in glory.\nWe believe that you will come and be our judge.\nCome then, Lord, and help your people,\n  bought with the price of your own blood,\n  and bring us with your saints\n  to glory everlasting.",
    },

    // ── Creed ────────────────────────────────────────────────────────
    {
      textKey: "apostles_creed",
      category: "creed",
      title: "The Apostles' Creed",
      bcpReference: "BCP p. 96",
      content:
        "I believe in God, the Father almighty,\n  creator of heaven and earth.\nI believe in Jesus Christ, his only Son, our Lord.\n  He was conceived by the power of the Holy Spirit\n    and born of the Virgin Mary.\n  He suffered under Pontius Pilate,\n    was crucified, died, and was buried.\n  He descended to the dead.\n  On the third day he rose again.\n  He ascended into heaven,\n    and is seated at the right hand of the Father.\n  He will come again to judge the living and the dead.\nI believe in the Holy Spirit,\n  the holy catholic Church,\n  the communion of saints,\n  the forgiveness of sins,\n  the resurrection of the body,\n  and the life everlasting. Amen.",
    },

    // ── Lord's Prayer ────────────────────────────────────────────────
    {
      textKey: "lords_prayer_contemporary",
      category: "lords_prayer",
      title: "The Lord's Prayer",
      bcpReference: "BCP p. 97",
      content:
        "Our Father in heaven,\n  hallowed be your Name,\n  your kingdom come,\n  your will be done,\n    on earth as in heaven.\nGive us today our daily bread.\nForgive us our sins\n  as we forgive those\n    who sin against us.\nSave us from the time of trial,\n  and deliver us from evil.\nFor the kingdom, the power,\n  and the glory are yours,\n  now and for ever. Amen.",
    },

    // ── Suffrages ────────────────────────────────────────────────────
    {
      textKey: "suffrages_a",
      category: "suffrages",
      title: "Suffrages A",
      bcpReference: "BCP p. 97",
      content:
        "V. Show us your mercy, O Lord;\nR. And grant us your salvation.\nV. Clothe your ministers with righteousness;\nR. Let your people sing with joy.\nV. Give peace, O Lord, in all the world;\nR. For only in you can we live in safety.\nV. Lord, keep this nation under your care;\nR. And guide us in the way of justice and truth.\nV. Let your way be known upon earth;\nR. Your saving health among all nations.\nV. Let not the needy, O Lord, be forgotten;\nR. Nor the hope of the poor be taken away.\nV. Create in us clean hearts, O God;\nR. And sustain us with your Holy Spirit.",
    },
    {
      textKey: "suffrages_b",
      category: "suffrages",
      title: "Suffrages B",
      bcpReference: "BCP p. 98",
      content:
        "V. Save your people, Lord, and bless your inheritance;\nR. Govern and uphold them, now and always.\nV. Day by day we bless you;\nR. We praise your name for ever.\nV. Lord, keep us from all sin today;\nR. Have mercy on us, Lord, have mercy.\nV. Lord, show us your love and mercy;\nR. For we put our trust in you.\nV. In you, Lord, is our hope;\nR. And we shall never hope in vain.",
    },

    // ── Collects ─────────────────────────────────────────────────────
    {
      textKey: "collect_for_grace",
      category: "collect",
      title: "A Collect for Grace",
      bcpReference: "BCP p. 100",
      content:
        "Lord God, almighty and everlasting Father, you have brought us in safety to this new day: Preserve us with your mighty power, that we may not fall into sin, nor be overcome by adversity; and in all we do, direct us to the fulfilling of your purpose; through Jesus Christ our Lord. Amen.",
    },

    // ── Prayers for Mission ──────────────────────────────────────────
    {
      textKey: "prayer_mission_1",
      category: "prayer_for_mission",
      title: "A Prayer for Mission",
      bcpReference: "BCP p. 100",
      content:
        "Almighty and everlasting God, by whose Spirit the whole body of your faithful people is governed and sanctified: Receive our supplications and prayers which we offer before you for all members of your holy Church, that in their vocation and ministry they may truly and devoutly serve you; through our Lord and Savior Jesus Christ. Amen.",
    },
    {
      textKey: "prayer_mission_2",
      category: "prayer_for_mission",
      title: "A Prayer for Mission",
      bcpReference: "BCP p. 101",
      content:
        "O God, you have made of one blood all the peoples of the earth, and sent your blessed Son to preach peace to those who are far off and to those who are near: Grant that people everywhere may seek after you and find you; bring the nations into your fold; pour out your Spirit upon all flesh; and hasten the coming of your kingdom; through Jesus Christ our Lord. Amen.",
    },
    {
      textKey: "prayer_mission_3",
      category: "prayer_for_mission",
      title: "A Prayer for Mission",
      bcpReference: "BCP p. 101",
      content:
        "Lord Jesus Christ, you stretched out your arms of love on the hard wood of the cross that everyone might come within the reach of your saving embrace: So clothe us in your Spirit that we, reaching forth our hands in love, may bring those who do not know you to the knowledge and love of you; for the honor of your Name. Amen.",
    },

    // ── General Thanksgiving ─────────────────────────────────────────
    {
      textKey: "general_thanksgiving",
      category: "general_thanksgiving",
      title: "The General Thanksgiving",
      bcpReference: "BCP p. 101",
      content:
        "Almighty God, Father of all mercies,\nwe your unworthy servants give you humble thanks\nfor all your goodness and loving-kindness\nto us and to all whom you have made.\nWe bless you for our creation, preservation,\nand all the blessings of this life;\nbut above all for your immeasurable love\nin the redemption of the world by our Lord Jesus Christ;\nfor the means of grace, and for the hope of glory.\nAnd, we pray, give us such an awareness of your mercies,\nthat with truly thankful hearts we may show forth your praise,\nnot only with our lips, but in our lives,\nby giving up our selves to your service,\nand by walking before you\nin holiness and righteousness all our days;\nthrough Jesus Christ our Lord,\nto whom, with you and the Holy Spirit,\nbe honor and glory throughout all ages. Amen.",
    },
  ];

  let count = 0;
  for (const row of texts) {
    await upsert(row);
    count++;
  }
  console.log(`  ✓ ${count} static texts seeded`);
}

/* ------------------------------------------------------------------ */
/*  Collect of the Day stubs — one per Sunday + season                 */
/* ------------------------------------------------------------------ */

async function seedCollectStubs() {
  console.log("Seeding collect stubs...");

  // These are placeholder collects. A full seed would fetch from bcponline.org.
  // For now we provide the most-used collects inline; the rest fall back to
  // "see BCP" in the UI.
  const collects: Array<Parameters<typeof upsert>[0]> = [
    {
      textKey: "collect_advent_1",
      category: "collect",
      title: "First Sunday of Advent",
      bcpReference: "BCP p. 211",
      seasonRestriction: "advent",
      content:
        "Almighty God, give us grace to cast away the works of darkness, and put on the armor of light, now in the time of this mortal life in which your Son Jesus Christ came to visit us in great humility; that in the last day, when he shall come again in his glorious majesty to judge both the living and the dead, we may rise to the life immortal; through him who lives and reigns with you and the Holy Spirit, one God, now and for ever. Amen.",
    },
    {
      textKey: "collect_advent_2",
      category: "collect",
      title: "Second Sunday of Advent",
      bcpReference: "BCP p. 211",
      seasonRestriction: "advent",
      content:
        "Merciful God, who sent your messengers the prophets to preach repentance and prepare the way for our salvation: Give us grace to heed their warnings and forsake our sins, that we may greet with joy the coming of Jesus Christ our Redeemer; who lives and reigns with you and the Holy Spirit, one God, now and for ever. Amen.",
    },
    {
      textKey: "collect_advent_3",
      category: "collect",
      title: "Third Sunday of Advent",
      bcpReference: "BCP p. 212",
      seasonRestriction: "advent",
      content:
        "Stir up your power, O Lord, and with great might come among us; and, because we are sorely hindered by our sins, let your bountiful grace and mercy speedily help and deliver us; through Jesus Christ our Lord, to whom, with you and the Holy Spirit, be honor and glory, now and for ever. Amen.",
    },
    {
      textKey: "collect_advent_4",
      category: "collect",
      title: "Fourth Sunday of Advent",
      bcpReference: "BCP p. 212",
      seasonRestriction: "advent",
      content:
        "Purify our conscience, Almighty God, by your daily visitation, that your Son Jesus Christ, at his coming, may find in us a mansion prepared for himself; who lives and reigns with you, in the unity of the Holy Spirit, one God, now and for ever. Amen.",
    },
    {
      textKey: "collect_christmas_1",
      category: "collect",
      title: "The Nativity of Our Lord: Christmas Day",
      bcpReference: "BCP p. 212",
      seasonRestriction: "christmas",
      content:
        "O God, you have caused this holy night to shine with the brightness of the true Light: Grant that we, who have known the mystery of that Light on earth, may also enjoy him perfectly in heaven; where with you and the Holy Spirit he lives and reigns, one God, in glory everlasting. Amen.",
    },
    {
      textKey: "collect_easter_day",
      category: "collect",
      title: "Easter Day",
      bcpReference: "BCP p. 222",
      seasonRestriction: "easter",
      content:
        "Almighty God, who through your only-begotten Son Jesus Christ overcame death and opened to us the gate of everlasting life: Grant that we, who celebrate with joy the day of the Lord's resurrection, may be raised from the death of sin by your life-giving Spirit; through Jesus Christ our Lord, who lives and reigns with you and the Holy Spirit, one God, now and for ever. Amen.",
    },
    {
      textKey: "collect_pentecost",
      category: "collect",
      title: "Day of Pentecost",
      bcpReference: "BCP p. 227",
      seasonRestriction: "easter",
      content:
        "Almighty God, on this day you opened the way of eternal life to every race and nation by the promised gift of your Holy Spirit: Shed abroad this gift throughout the world by the preaching of the Gospel, that it may reach to the ends of the earth; through Jesus Christ our Lord, who lives and reigns with you, in the unity of the Holy Spirit, one God, for ever and ever. Amen.",
    },
    {
      textKey: "collect_trinity",
      category: "collect",
      title: "Trinity Sunday",
      bcpReference: "BCP p. 228",
      content:
        "Almighty and everlasting God, you have given to us your servants grace, by the confession of a true faith, to acknowledge the glory of the eternal Trinity, and in the power of your divine Majesty to worship the Unity: Keep us steadfast in this faith and worship, and bring us at last to see you in your one and eternal glory, O Father; who with the Son and the Holy Spirit live and reign, one God, for ever and ever. Amen.",
    },
  ];

  let count = 0;
  for (const row of collects) {
    await upsert(row);
    count++;
  }
  console.log(`  ✓ ${count} collect stubs seeded`);
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export async function seedBcpTexts(): Promise<{ inserted: number; skipped: number }> {
  console.log("=== BCP Texts Seed Script ===\n");
  await seedStaticTexts();
  await sleep(DELAY_MS);
  await seedCollectStubs();
  console.log("\n✓ BCP texts seed complete.");
  return { inserted: 0, skipped: 0 };
}

// Allow direct execution: pnpm tsx src/seeds/bcpTexts.ts
if (process.argv[1] && process.argv[1].endsWith("bcpTexts.ts")) {
  seedBcpTexts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
