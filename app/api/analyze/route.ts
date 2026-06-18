import { NextResponse } from "next/server";
import { getGroqClient } from "../../../lib/groq";

type RegretCategory = "money" | "relationships" | "school" | "health" | "other";
type AnalysisResult = {
  title: string;
  immediate: string;
  one_month: string;
  one_year: string;
  regret_score: number;
  advice: string;
  category: RegretCategory;
};

function extractJson(raw: string) {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}$/);
  if (!jsonMatch) {
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

function normalizeResult(value: unknown): AnalysisResult {
  const fallback: AnalysisResult = {
    title: "Regret analysis",
    immediate: "Unable to parse the model result.",
    one_month: "Unable to parse the model result.",
    one_year: "Unable to parse the model result.",
    regret_score: 50,
    advice:
      "The AI response was malformed. Try again with a shorter or clearer decision description.",
    category: "other",
  };

  if (typeof value !== "object" || value === null) {
    return fallback;
  }

  const data = value as Record<string, unknown>;

  const title =
    typeof data.title === "string" && data.title.trim().length > 0
      ? data.title.trim()
      : fallback.title;
  const immediate =
    typeof data.immediate === "string" && data.immediate.trim().length > 0
      ? data.immediate.trim()
      : fallback.immediate;
  const one_month =
    typeof data.one_month === "string" && data.one_month.trim().length > 0
      ? data.one_month.trim()
      : fallback.one_month;
  const one_year =
    typeof data.one_year === "string" && data.one_year.trim().length > 0
      ? data.one_year.trim()
      : fallback.one_year;
  const advice =
    typeof data.advice === "string" && data.advice.trim().length > 0
      ? data.advice.trim()
      : fallback.advice;
  const regret_score =
    typeof data.regret_score === "number" && Number.isFinite(data.regret_score)
      ? Math.min(100, Math.max(0, Math.round(data.regret_score)))
      : fallback.regret_score;
  const category =
    data.category === "money" ||
    data.category === "relationships" ||
    data.category === "school" ||
    data.category === "health" ||
    data.category === "other"
      ? (data.category as RegretCategory)
      : fallback.category;

  return {
    title,
    immediate,
    one_month,
    one_year,
    regret_score,
    advice,
    category,
  };
}

export async function POST(req: Request) {
  const body = await req.json();
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!text) {
    return NextResponse.json({ error: "No decision text provided." }, { status: 400 });
  }

  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing GROQ_API_KEY." },
      { status: 500 }
    );
  }

  const prompt = `You are RegretGPT. Analyze the user's decision and return ONLY valid JSON with the following fields:
- title: A short, clear summary of the decision.
- immediate: The current emotional and practical outcome.
- one_month: What the decision will likely feel like in one month.
- one_year: What the decision will likely feel like in one year.
- regret_score: A number from 0 to 100.
- advice: A concise recommendation for the user.
- category: one of money, relationships, school, health, other.

Return only the JSON object and nothing else.`;

  try {
    const groq = getGroqClient();
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: text },
      ],
      temperature: 0.45,
      max_tokens: 420,
    });

    const rawResponse = completion.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = extractJson(rawResponse) ?? extractJson(JSON.stringify(rawResponse));

    if (!parsed) {
      return NextResponse.json(
        normalizeResult({ advice: rawResponse }),
        { status: 200 }
      );
    }

    return NextResponse.json(normalizeResult(parsed));
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to generate analysis. Please try again later.";
    console.error("RegretGPT analyze error:", message, error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
