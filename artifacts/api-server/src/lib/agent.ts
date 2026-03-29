import { anthropic } from "@workspace/integrations-anthropic-ai";
import type { Ritual } from "@workspace/db";
import { getFreeBusy } from "./calendar";

interface AgentContext {
  ritual: Ritual & {
    participants: Array<{ name: string; email: string }>;
  };
  streak: number;
  lastMeetupDate: string | null;
  nextMeetupDate: string | null;
}

function buildSystemPrompt(ctx: AgentContext): string {
  const participants = ctx.ritual.participants.map((p) => p.name).join(", ");
  const lastMeetup = ctx.lastMeetupDate
    ? new Date(ctx.lastMeetupDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "Not yet held";
  const nextMeetup = ctx.nextMeetupDate
    ? new Date(ctx.nextMeetupDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "Not yet scheduled";

  return `You are Eleanor — a warm, proactive assistant whose purpose is to help small groups maintain their recurring social rituals and cultivate lasting traditions.

You have access to the following context about this ritual:
- Name: ${ctx.ritual.name}
- Participants: ${participants}
- Frequency: ${ctx.ritual.frequency}
- Day preference: ${ctx.ritual.dayPreference ?? "None specified"}
- Current streak: ${ctx.streak} meetup${ctx.streak !== 1 ? "s" : ""}
- Last meetup: ${lastMeetup}
- Upcoming planned meetup: ${nextMeetup}
- Intention: ${ctx.ritual.intention ?? "None specified"}

Your personality:
- Warm but not saccharine
- Practical and action-oriented
- You celebrate milestones ("8 weeks in a row — that's a real ritual now")
- You re-engage gently when groups go quiet
- You suggest concrete next steps, not vague encouragement
- You speak as if you genuinely care about this group

When someone needs to reschedule, help them find a new date. When a streak is broken, acknowledge it without shame and focus on what's next. When a ritual is new, set expectations warmly.

Never be a generic chatbot. You are the infrastructure that holds this community together.`;
}

export async function getWelcomeMessage(ctx: AgentContext): Promise<string> {
  const participants = ctx.ritual.participants.map((p) => p.name).join(", ");
  const systemPrompt = buildSystemPrompt(ctx);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `I just created a new ritual called "${ctx.ritual.name}" with ${participants}. We plan to meet ${ctx.ritual.frequency}.${ctx.ritual.intention ? ` Our intention: ${ctx.ritual.intention}` : ""} Please send us a warm welcome message as our coordinator.`,
      },
    ],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "Welcome to your new ritual! I'm here to help coordinate your group.";
}

export async function suggestMeetingTimes(
  userId: number,
  ritual: Ritual & { participants: Array<{ name: string; email: string }> }
): Promise<string[]> {
  const now = new Date();
  const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const busySlots = await getFreeBusy(userId, now, twoWeeksOut);

  const busyText = busySlots.length > 0
    ? busySlots.map((s) => `${s.start} to ${s.end}`).join("\n")
    : "No busy times found — calendar appears open.";

  const prompt = `You are a scheduling assistant. Given the organizer's busy calendar windows and the ritual's preferences, suggest exactly 3 meeting times (1 primary + 2 alternates) over the next 14 days.

Ritual details:
- Name: ${ritual.name}
- Frequency: ${ritual.frequency}
- Day preference: ${ritual.dayPreference ?? "None specified"}

Organizer busy windows (UTC):
${busyText}

Today is: ${now.toISOString()}

Rules:
- Avoid all busy windows
- Honor day preference if specified (e.g. "Thursday evenings" = Thursday between 18:00-22:00 UTC)
- Times should be between 09:00 and 22:00 UTC
- Space the 3 suggestions across different days when possible
- Duration: 1 hour each

Respond with ONLY a valid JSON array of exactly 3 ISO 8601 UTC timestamp strings. No explanation, no markdown, just the array. Example: ["2025-04-01T18:00:00.000Z","2025-04-03T19:00:00.000Z","2025-04-08T18:00:00.000Z"]`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") return [];

  try {
    const text = block.text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed) && parsed.length === 3) {
      const times = parsed.map((t: unknown) => String(t));
      const now = new Date();
      const allValid = times.every((t) => {
        const d = new Date(t);
        return !isNaN(d.getTime()) && d > now;
      });
      if (allValid) return times;
    }
  } catch {
  }

  return [];
}

export async function getCoordinatorResponse(
  ctx: AgentContext,
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>,
  userMessage: string
): Promise<string> {
  const systemPrompt = buildSystemPrompt(ctx);

  const messages = [
    ...chatHistory.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: systemPrompt,
    messages,
  });

  const block = response.content[0];
  return block.type === "text" ? block.text : "I'm here to help coordinate your ritual.";
}
