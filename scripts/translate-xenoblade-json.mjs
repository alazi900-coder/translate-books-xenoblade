#!/usr/bin/env node
/**
 * Translates a Xenoblade Chronicles bdat-export JSON file (English -> Arabic).
 *
 * Strict rules:
 *  - JSON keys (bdat-bin:...) are NEVER changed.
 *  - Every technical tag must appear in the translation EXACTLY as in the source:
 *      [XENO:...], [System:...], [/System:...], [ML:icon icon=enhXX ], etc.
 *      escaped brackets \[..\], the escape sequence [XENO:n ] used as line break.
 *  - Numbers, percentages, and IDs are preserved literally.
 *  - Japanese-only entries are kept as-is.
 *  - A small in-script glossary forces consistent translations of recurring
 *    combat terms (Topple, Daze, Aura, Mechon...).
 *
 * Strategy:
 *  - Read input JSON (with one-line repair for the malformed source).
 *  - Build a list of translatable entries (skip empty / Japanese / numeric).
 *  - Batch entries (~20 per request) and send to Gemini 2.5 Flash with a
 *    structured prompt that returns JSON.
 *  - Validate each translated entry: every tag in the source must reappear
 *    verbatim in the translation, otherwise we retry (up to 3 times) and on
 *    final failure keep the original English (logged to stderr).
 *  - Persist progress in a .partial.json checkpoint after every batch so we
 *    can resume on crashes.
 *
 * Usage:
 *   GEMINI_API_KEY=... node scripts/translate-xenoblade-json.mjs \
 *      --input  /path/to/source.json \
 *      --output /path/to/dest.json \
 *      [--model gemini-2.5-flash] [--batch 20] [--concurrency 3]
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
    model: "gemini-2.5-flash",
    batch: 18,
    concurrency: 3,
    retries: 3,
    resume: true,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--input": args.input = next(); break;
      case "--output": args.output = next(); break;
      case "--model": args.model = next(); break;
      case "--batch": args.batch = parseInt(next(), 10); break;
      case "--concurrency": args.concurrency = parseInt(next(), 10); break;
      case "--retries": args.retries = parseInt(next(), 10); break;
      case "--no-resume": args.resume = false; break;
      default: throw new Error(`Unknown arg: ${a}`);
    }
  }
  if (!args.input || !args.output) {
    throw new Error("--input and --output are required");
  }
  return args;
}

// ---------------------------------------------------------------------------
// JSON loading (with one-line repair for the malformed source)
// ---------------------------------------------------------------------------

function loadInputJson(file) {
  const raw = fs.readFileSync(file, "utf8");
  // The user's file starts with: {\n  "\n  "bdat-bin:..."
  // Drop that orphan quote line if present.
  const repaired = raw.replace(/^\{\s*\n\s*"\s*\n/, "{\n");
  try {
    return JSON.parse(repaired);
  } catch (err) {
    // Try a more aggressive repair: drop any 1-char-only quoted line near top.
    const lines = repaired.split("\n");
    const filtered = lines.filter(
      (l, i) => !(i > 0 && i < 5 && /^\s*"\s*$/.test(l))
    );
    return JSON.parse(filtered.join("\n"));
  }
}

// ---------------------------------------------------------------------------
// Tag detection & validation
// ---------------------------------------------------------------------------

const TAG_PATTERNS = [
  /\[XENO:[^\]]*\]/g,
  /\[System:[^\]]*\]/g,
  /\[ML:[^\]]*\]/g,
  /\[\/[^\]]+\]/g,
  /\\\[/g, // escaped left-bracket
  /\\\]/g, // escaped right-bracket
];

function extractTagMultiset(text) {
  const counts = new Map();
  for (const re of TAG_PATTERNS) {
    const matches = text.match(re) || [];
    for (const m of matches) {
      counts.set(m, (counts.get(m) || 0) + 1);
    }
  }
  return counts;
}

function tagsMatch(originalText, translatedText) {
  const a = extractTagMultiset(originalText);
  const b = extractTagMultiset(translatedText);
  if (a.size !== b.size) return false;
  for (const [tag, n] of a) {
    if (b.get(tag) !== n) return false;
  }
  return true;
}

const JAPANESE_RE = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
const ONLY_NUMERIC_OR_TAGS_RE =
  /^(?:\s|[\d.,%+\-]|\[(?:XENO|System|ML|\/[^\]]+):[^\]]*\]|\\\[|\\\])*$/;

function isTranslatable(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (JAPANESE_RE.test(value)) return false;
  if (ONLY_NUMERIC_OR_TAGS_RE.test(value)) return false;
  // require at least one ascii letter
  return /[A-Za-z]/.test(value);
}

// ---------------------------------------------------------------------------
// Glossary - locks recurring combat / world terminology
// ---------------------------------------------------------------------------

const GLOSSARY = [
  // Status effects
  { en: "Topple",        ar: "إسقاط" },
  { en: "Daze",          ar: "ذهول" },
  { en: "Break",         ar: "كسر" },
  { en: "Sleep",         ar: "نوم" },
  { en: "Paralysis",     ar: "شلل" },
  { en: "Slow",          ar: "إبطاء" },
  { en: "Haste",         ar: "تسريع" },
  { en: "Aura",          ar: "هالة" },
  { en: "Buff",          ar: "تعزيز" },
  { en: "Debuff",        ar: "إضعاف" },
  { en: "Lock-On",       ar: "تثبيت الهدف" },
  { en: "Awakening",     ar: "صحوة" },
  { en: "Crazed",        ar: "هياج" },
  { en: "Talent Gauge",  ar: "مقياس الموهبة" },
  // Stats
  { en: "Strength",      ar: "القوة" },
  { en: "Agility",       ar: "الرشاقة" },
  { en: "Phys. Def.",    ar: "الدفاع البدني" },
  { en: "Ether Def.",    ar: "الدفاع الأثيري" },
  { en: "HP",            ar: "نقاط الحياة" },
  // Factions / proper nouns
  { en: "Mechon",        ar: "ميكون" },
  { en: "Homs",          ar: "الهومز" },
  { en: "Nopon",         ar: "النوبون" },
  { en: "High Entia",    ar: "الهاي إنشيا" },
  { en: "Bionis",        ar: "بايونيس" },
  { en: "Mechonis",      ar: "ميكونيس" },
  { en: "Monado",        ar: "المونادو" },
  { en: "Telethia",      ar: "تيليثيا" },
  // Characters
  { en: "Shulk",         ar: "شولك" },
  { en: "Fiora",         ar: "فيورا" },
  { en: "Reyn",          ar: "رين" },
  { en: "Sharla",        ar: "شارلا" },
  { en: "Dunban",        ar: "دونبان" },
  { en: "Melia",         ar: "ميليا" },
  { en: "Riki",          ar: "ريكي" },
  { en: "Tyrea",         ar: "تيريا" },
  // Combat verbs / arts
  { en: "Side attack",   ar: "هجوم جانبي" },
  { en: "Bone Upper",    ar: "ضربة العظم" },
  { en: "Gale Slash",    ar: "ضربة العاصفة" },
  { en: "Cannon Drones", ar: "طائرات المدفع" },
  { en: "Gun Drones",    ar: "طائرات البندقية" },
];

function glossaryBlock() {
  return GLOSSARY.map(g => `- "${g.en}" => "${g.ar}"`).join("\n");
}

// ---------------------------------------------------------------------------
// LLM call (Gemini REST API)
// ---------------------------------------------------------------------------

const SYSTEM_INSTRUCTIONS = `أنت مترجم محترف لنصوص لعبة Xenoblade Chronicles من الإنجليزية إلى العربية الفصحى الواضحة.
قواعد صارمة لا يُسمح بكسرها:
1) أعد كل نص داخل حقل "translation" فقط، بدون أي تعليق أو شرح.
2) حافظ على كل علامة تقنية بالضبط كما هي في النص الأصلي وفي نفس موقعها داخل الجملة:
   - علامات [XENO:...] مثل [XENO:wait wait=key ] و [XENO:del del=this ] و [XENO:n ].
   - علامات [System:...]...[/System:...] بكل خصائصها (name=arts_sp ...الخ).
   - علامات [ML:icon icon=enhXX ] و [ML:space ].
   - الأقواس المهربة \\[ و \\] تبقى مهربة.
   - فواصل الأسطر \\n تبقى كما هي.
3) لا تترجم الأرقام، النسب المئوية، المعرّفات، أو أسماء أيقونات (enh37, arts_sp...).
4) استخدم القاموس التالي حرفياً عند ورود المصطلح:
${glossaryBlock()}
5) لا تضف ولا تحذف أي شيء خارج النص. لا تُحوّل [XENO:n ] إلى سطر جديد فعلي.
6) أعد الناتج كمصفوفة JSON صرفة، كل عنصر يحوي id والرقم نفسه ثم translation.
7) إذا تعذّر ترجمة نص (مثلاً مجرد رمز بلا كلمات) أعد نفس النص.`;

async function callGemini(model, apiKey, batch) {
  const userPrompt =
    "ترجم هذه النصوص. أعد الناتج JSON فقط، مصفوفة من {id, translation}.\n\n" +
    JSON.stringify(
      batch.map(b => ({ id: b.id, text: b.text })),
      null,
      2
    );
  const body = {
    contents: [
      { role: "user", parts: [{ text: userPrompt }] },
    ],
    systemInstruction: {
      role: "system",
      parts: [{ text: SYSTEM_INSTRUCTIONS }],
    },
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            id: { type: "INTEGER" },
            translation: { type: "STRING" },
          },
          required: ["id", "translation"],
        },
      },
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 600)}`);
  }
  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error("Gemini response missing candidates");
  const text =
    candidate.content?.parts?.map(p => p.text || "").join("") ?? "";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (!fence) throw new Error("Gemini did not return JSON: " + text.slice(0, 300));
    parsed = JSON.parse(fence[1]);
  }
  if (!Array.isArray(parsed)) throw new Error("Gemini returned non-array");
  return parsed;
}

// ---------------------------------------------------------------------------
// Batch + retry orchestration
// ---------------------------------------------------------------------------

async function translateBatchWithRetry(model, apiKey, batch, retries) {
  let lastErr = null;
  let pending = batch;
  const accepted = new Map(); // id -> translation

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const result = await callGemini(model, apiKey, pending);
      const byId = new Map(result.map(r => [r.id, r.translation]));
      const stillPending = [];
      for (const item of pending) {
        const t = byId.get(item.id);
        if (typeof t !== "string") {
          stillPending.push(item);
          continue;
        }
        if (!tagsMatch(item.text, t)) {
          stillPending.push(item);
          continue;
        }
        accepted.set(item.id, t);
      }
      if (stillPending.length === 0) {
        return { accepted, rejected: [] };
      }
      pending = stillPending;
      lastErr = new Error(
        `${stillPending.length} of ${batch.length} entries failed tag validation`
      );
    } catch (err) {
      lastErr = err;
      // exponential backoff
      await sleep(800 * attempt);
    }
  }
  return { accepted, rejected: pending, error: lastErr };
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// ---------------------------------------------------------------------------
// Worker pool
// ---------------------------------------------------------------------------

async function runWithConcurrency(items, concurrency, worker) {
  let next = 0;
  const failures = [];
  async function loop() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        await worker(items[i], i);
      } catch (err) {
        failures.push({ index: i, err });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => loop()));
  return failures;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY env var is required");

  const data = loadInputJson(args.input);
  const allKeys = Object.keys(data);
  console.log(`Loaded ${allKeys.length} keys from ${path.basename(args.input)}`);

  const entries = [];
  for (const k of allKeys) {
    const v = data[k];
    if (isTranslatable(v)) entries.push({ key: k, text: v });
  }
  console.log(`Translatable entries: ${entries.length}`);

  // Resume from checkpoint if present
  const checkpointPath = args.output + ".partial.json";
  const translations = new Map(); // key -> translated string
  if (args.resume && fs.existsSync(checkpointPath)) {
    try {
      const ck = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
      for (const [k, v] of Object.entries(ck)) {
        if (typeof v === "string") translations.set(k, v);
      }
      console.log(`Resumed ${translations.size} translations from checkpoint`);
    } catch (err) {
      console.warn("Failed to read checkpoint, starting fresh:", err.message);
    }
  }

  const remaining = entries.filter(e => !translations.has(e.key));
  console.log(`Remaining to translate: ${remaining.length}`);

  // Build batches
  const batches = [];
  for (let i = 0; i < remaining.length; i += args.batch) {
    const slice = remaining.slice(i, i + args.batch);
    batches.push(
      slice.map((e, idx) => ({
        id: idx,
        key: e.key,
        text: e.text,
      }))
    );
  }
  console.log(`Total batches: ${batches.length} (concurrency=${args.concurrency})`);

  let completedBatches = 0;
  let droppedEntries = 0;
  const t0 = Date.now();

  await runWithConcurrency(batches, args.concurrency, async (batch) => {
    const { accepted, rejected, error } = await translateBatchWithRetry(
      args.model,
      apiKey,
      batch,
      args.retries
    );
    for (const item of batch) {
      const t = accepted.get(item.id);
      if (typeof t === "string") {
        translations.set(item.key, t);
      } else {
        // keep original (dropped)
        translations.set(item.key, item.text);
        droppedEntries += 1;
      }
    }
    completedBatches += 1;
    // checkpoint every batch
    fs.writeFileSync(
      checkpointPath,
      JSON.stringify(Object.fromEntries(translations), null, 0)
    );
    const pct = ((completedBatches / batches.length) * 100).toFixed(1);
    const eta =
      ((Date.now() - t0) / completedBatches) *
      (batches.length - completedBatches);
    process.stdout.write(
      `\r[${pct}%] batch ${completedBatches}/${batches.length} ` +
        `dropped=${droppedEntries} ETA=${(eta / 1000).toFixed(0)}s ` +
        (rejected?.length
          ? `(retries left: ${rejected.length} entries failed validation) `
          : " ") +
        (error ? `last_err=${String(error.message).slice(0, 60)}` : "")
    );
  });

  process.stdout.write("\n");

  // Build output: same key order as input, replace English with Arabic where translated
  const output = {};
  for (const k of allKeys) {
    if (translations.has(k)) {
      output[k] = translations.get(k);
    } else {
      // untranslatable (Japanese, numeric, etc.) -> leave as-is
      output[k] = data[k];
    }
  }

  fs.writeFileSync(
    args.output,
    JSON.stringify(output, null, 2) + "\n",
    "utf8"
  );
  console.log(`Wrote ${args.output}`);
  console.log(`Dropped (kept English) entries: ${droppedEntries}`);

  // Final structural validation
  let mismatches = 0;
  for (const k of Object.keys(data)) {
    if (!(k in output)) {
      mismatches += 1;
      console.error(`MISSING KEY in output: ${k}`);
    }
  }
  for (const k of Object.keys(output)) {
    if (!(k in data)) {
      mismatches += 1;
      console.error(`EXTRA KEY in output: ${k}`);
    }
  }
  if (mismatches === 0) {
    console.log("Structure validated: every input key is present, no extras.");
  } else {
    console.error(`STRUCTURE ERRORS: ${mismatches}`);
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
