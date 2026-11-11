// Optional AI (OpenRouter) — the key is entered in the app's settings and stays on the phone.
import { postJSON } from "./http";
import { kvGet } from "./store";

export async function aiConfig() {
  return {
    key: await kvGet("ai.key", ""),
    model: await kvGet("ai.model", "openai/gpt-4o-mini"),
  };
}

async function chat(prompt, maxTokens = 600) {
  const { key, model } = await aiConfig();
  if (!key) throw new Error("no-key");
  const data = await postJSON(
    "https://openrouter.ai/api/v1/chat/completions",
    { model, temperature: 0.35, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] },
    { Authorization: `Bearer ${key}`, "X-Title": "Delon" }
  );
  return data.choices[0].message.content.trim();
}

export const summarize = (article) =>
  chat(
    "قم بتلخيص النص التالي بشكل واضح ومختصر مع الحفاظ على النقاط الرئيسية. " +
      "اكتب الملخص باللغة العربية في فقرة واحدة وبصيغة الماضي:\n\n" +
      `${article.title}. ${(article.content || "").slice(0, 3000)}`,
    500
  );

export const editorial = (digest) =>
  chat(
    "أنت محرر صحفي في جريدة محلية بإقليم الرحامنة. اعتمادا فقط على الأخبار التالية، " +
      "اكتب مقالا افتتاحيا واحدا بالعربية الفصحى (بين 150 و250 كلمة) يلخص أبرز ما جرى " +
      "في الإقليم، بأسلوب صحفي محايد، دون عناوين أو تعداد نقطي ودون اختلاق معلومات:\n\n" +
      digest,
    700
  );
