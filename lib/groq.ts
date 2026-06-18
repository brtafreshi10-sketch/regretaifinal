import Groq from "groq-sdk";

export function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY");
  }

  return new Groq({ apiKey });
}
