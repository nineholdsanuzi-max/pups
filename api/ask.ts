/**
 * POST /api/ask   body: { input }
 *
 * The page's cat chat, narratives, post packs and debates. `input` is either a
 * prompt string or a list of { role: "user" | "assistant", content } turns
 * ending on a user turn, exactly as the page builds them. Returns { text }.
 *
 * Calls the Claude Messages API with your key, which must stay on the server.
 * Model names change: set ANTHROPIC_MODEL from https://docs.claude.com/en/api/overview
 *
 * Every call costs money, so three limits apply: per visitor per minute, per
 * visitor per day, and everyone together per day (ASK_DAILY_CAP, default 5000).
 */
import { allow, visitor } from "../server/rateLimit";
type Turn = { role: "user" | "assistant"; content: string };

const MAX_INPUT_CHARS = 24_000;

function toTurns(input: unknown): Turn[] | null {
  if (typeof input === "string" && input.trim()) return [{ role: "user", content: input }];
  if (!Array.isArray(input) || input.length === 0) return null;
  const turns: Turn[] = [];
  for (const t of input) {
    if (!t || typeof t !== "object") return null;
    const { role, content } = t as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content) return null;
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += "\n\n" + content;
    else turns.push({ role, content });
  }
  if (turns[0].role !== "user" || turns[turns.length - 1].role !== "user") return null;
  return turns;
}

export async function POST(req: Request): Promise<Response> {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!key || !model) {
    return Response.json({ error: "The pup's chat is not set up on this server yet." }, { status: 501 });
  }

  const who = visitor(req);
  const day = new Date().toISOString().slice(0, 10);
  const cap = Number(process.env.ASK_DAILY_CAP ?? 5000);
  if (!(await allow(`ask:min:${who}`, 12, 60)) || !(await allow(`ask:day:${who}:${day}`, 300, 86_400))) {
    return Response.json({ error: "Your cat needs a short rest. Try again in a minute." }, { status: 429 });
  }
  if (!(await allow(`ask:all:${day}`, cap, 86_400))) {
    return Response.json({ error: "The pups have answered as many questions as they can today." }, { status: 429 });
  }

  let body: { input?: unknown };
  try {
    body = (await req.json()) as { input?: unknown };
  } catch {
    return Response.json({ error: "Send JSON with an input field." }, { status: 400 });
  }
  const turns = toTurns(body.input);
  if (!turns || JSON.stringify(turns).length > MAX_INPUT_CHARS) {
    return Response.json({ error: "Send a prompt, or turns that start and end with the user." }, { status: 400 });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: 1000, messages: turns }),
  });
  if (!res.ok) {
    return Response.json({ error: "The pup couldn't answer right now." }, { status: 502 });
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
  return Response.json({ text });
}
