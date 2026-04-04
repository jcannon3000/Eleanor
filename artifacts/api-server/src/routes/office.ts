/**
 * Daily Office Routes
 *
 * GET  /office/morning          — returns assembled Morning Prayer slides (mounted at /api)
 * POST /office/morning/prefetch — warms cache for a future date (internal, mounted at /api)
 */

import { Router } from "express";
import { assembleMorningPrayer } from "../lib/assembleMorningPrayer";
import { getOfficeDay } from "../lib/liturgicalCalendar";
import { seedBcpTexts } from "../seeds/bcpTexts";

const router = Router();

// GET /office/morning — public, no auth required (liturgical content is same for all users)
router.get("/office/morning", async (req, res) => {
  let date: Date;
  try {
    date = req.query.date
      ? new Date(req.query.date as string)
      : new Date();
    if (isNaN(date.getTime())) throw new Error("Invalid date");
  } catch {
    date = new Date();
  }

  try {
    const userId = (req.user as { id: number } | undefined)?.id ?? 0;
    const { slides, officeDay, fromCache } = await assembleMorningPrayer(
      date,
      userId,
    );

    return res.json({
      slides,
      officeDay: {
        ...officeDay,
        totalSlides: slides.length,
      },
      fromCache,
      cacheDate: date.toISOString().slice(0, 10),
    });
  } catch (err) {
    console.error("Morning Prayer assembly failed:", err);

    // Emergency fallback office — never return a 500 to the user
    const officeDay = getOfficeDay(date);
    const emergencySlides = [
      {
        id: "emergency_0",
        type: "opening",
        emoji: "✨",
        eyebrow: "",
        title: null,
        content: officeDay.weekdayLabel,
        isCallAndResponse: false,
        callAndResponseLines: null,
        bcpReference: null,
        isScrollable: false,
        scrollHint: null,
        metadata: { season: officeDay.season, date: date.toISOString() },
      },
      {
        id: "emergency_1",
        type: "invitatory_psalm",
        emoji: "🎶",
        eyebrow: "VENITE · PSALM 95",
        title: null,
        content:
          "Come, let us sing to the Lord; *\n  let us shout for joy to the Rock of our salvation.\nLet us come before his presence with thanksgiving *\n  and raise a loud shout to him with psalms.\nFor the Lord is a great God, *\n  and a great King above all gods.\nIn his hand are the caverns of the earth, *\n  and the heights of the hills are his also.\nThe sea is his, for he made it, *\n  and his hands have molded the dry land.\nCome, let us bow down, and bend the knee, *\n  and kneel before the Lord our Maker.\nFor he is our God,\nand we are the people of his pasture and the sheep of his hand. *\n  Oh, that today you would hearken to his voice!",
        isCallAndResponse: false,
        callAndResponseLines: null,
        bcpReference: "BCP p. 82",
        isScrollable: false,
        scrollHint: null,
        metadata: {},
      },
      {
        id: "emergency_2",
        type: "general_thanksgiving",
        emoji: "🌾",
        eyebrow: "THE GENERAL THANKSGIVING",
        title: null,
        content:
          "Almighty God, Father of all mercies,\nwe your unworthy servants give you humble thanks\nfor all your goodness and loving-kindness\nto us and to all whom you have made.\nWe bless you for our creation, preservation,\nand all the blessings of this life;\nbut above all for your immeasurable love\nin the redemption of the world by our Lord Jesus Christ;\nfor the means of grace, and for the hope of glory.\nAnd, we pray, give us such an awareness of your mercies,\nthat with truly thankful hearts we may show forth your praise,\nnot only with our lips, but in our lives,\nby giving up our selves to your service,\nand by walking before you\nin holiness and righteousness all our days;\nthrough Jesus Christ our Lord,\nto whom, with you and the Holy Spirit,\nbe honor and glory throughout all ages. Amen.",
        isCallAndResponse: false,
        callAndResponseLines: null,
        bcpReference: "BCP p. 101",
        isScrollable: true,
        scrollHint: "↓ continue · tap when ready",
        metadata: {},
      },
      {
        id: "emergency_3",
        type: "closing",
        emoji: "🙏",
        eyebrow: "",
        title: null,
        content: "Morning Prayer",
        isCallAndResponse: false,
        callAndResponseLines: null,
        bcpReference: null,
        isScrollable: false,
        scrollHint: null,
        metadata: { date: date.toISOString() },
      },
    ];

    return res.json({
      slides: emergencySlides,
      officeDay: {
        season: officeDay.season,
        liturgicalYear: officeDay.liturgicalYear,
        sundayLabel: officeDay.sundayLabel,
        weekdayLabel: officeDay.weekdayLabel,
        properNumber: officeDay.properNumber,
        feastName: officeDay.feastName,
        isMajorFeast: officeDay.isMajorFeast,
        useAlleluia: officeDay.useAlleluia,
        totalSlides: emergencySlides.length,
      },
      fromCache: false,
      cacheDate: date.toISOString().slice(0, 10),
      isEmergency: true,
    });
  }
});

// POST /office/morning/prefetch (internal, nightly cron at 11pm)
router.post("/office/morning/prefetch", async (req, res) => {
  const internalKey = req.headers["x-internal-key"];
  if (!internalKey || internalKey !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }

  let date: Date;
  try {
    date = req.body?.date ? new Date(req.body.date) : new Date();
    // Default to tomorrow
    if (!req.body?.date) {
      date.setDate(date.getDate() + 1);
    }
    if (isNaN(date.getTime())) throw new Error("Invalid date");
  } catch {
    date = new Date();
    date.setDate(date.getDate() + 1);
  }

  try {
    const { fromCache } = await assembleMorningPrayer(date, 0);
    return res.json({
      cached: !fromCache,
      date: date.toISOString().slice(0, 10),
    });
  } catch (err) {
    console.error("Morning Prayer prefetch failed:", err);
    return res.status(500).json({ error: "Prefetch failed" });
  }
});

// POST /office/seed — one-time BCP texts seed (internal)
router.post("/office/seed", async (req, res) => {
  const internalKey = req.headers["x-internal-key"];
  if (!internalKey || internalKey !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const result = await seedBcpTexts();
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("BCP seed failed:", err);
    return res.status(500).json({ error: "Seed failed", detail: String(err) });
  }
});

export default router;
