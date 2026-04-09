export interface OpenAiAdviceResponse {
  bestMove: string;
  why: string[];
  risk: "low" | "medium" | "high";
  unseenJacks?: string[];
  unseenTrumpCountEstimate?: number;
}

export interface OpenAiChatMessage {
  role: "system" | "user";
  content: string;
}

export function buildAdviceMessages(payload: unknown): OpenAiChatMessage[] {
  return [
    {
      role: "system",
      content:
        "Ты тренер по игре Белка. Анализируй только входные данные. Верни ответ JSON: bestMove, why, risk, unseenJacks, unseenTrumpCountEstimate.",
    },
    {
      role: "user",
      content: JSON.stringify(payload),
    },
  ];
}

export async function callOpenAi(
  apiKey: string,
  model: string,
  payload: unknown
): Promise<OpenAiAdviceResponse> {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  const body = {
    model,
    messages: buildAdviceMessages(payload),
    temperature: 0.2,
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${text}`);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Invalid OpenAI response");
  }

  return JSON.parse(content) as OpenAiAdviceResponse;
}
