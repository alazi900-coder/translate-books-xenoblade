export interface Language {
  code: string;
  name: string;
  /** English name used for fuzzy search. */
  englishName: string;
  rtl?: boolean;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: "en", name: "English", englishName: "English" },
  { code: "ar", name: "العربية", englishName: "Arabic", rtl: true },
  { code: "fr", name: "Français", englishName: "French" },
  { code: "es", name: "Español", englishName: "Spanish" },
  { code: "de", name: "Deutsch", englishName: "German" },
  { code: "it", name: "Italiano", englishName: "Italian" },
  { code: "pt", name: "Português", englishName: "Portuguese" },
  { code: "ru", name: "Русский", englishName: "Russian" },
  { code: "ja", name: "日本語", englishName: "Japanese" },
  { code: "ko", name: "한국어", englishName: "Korean" },
  { code: "zh", name: "中文", englishName: "Chinese" },
  { code: "tr", name: "Türkçe", englishName: "Turkish" },
  { code: "pl", name: "Polski", englishName: "Polish" },
  { code: "nl", name: "Nederlands", englishName: "Dutch" },
  { code: "sv", name: "Svenska", englishName: "Swedish" },
  { code: "no", name: "Norsk", englishName: "Norwegian" },
  { code: "da", name: "Dansk", englishName: "Danish" },
  { code: "fi", name: "Suomi", englishName: "Finnish" },
  { code: "el", name: "Ελληνικά", englishName: "Greek" },
  { code: "cs", name: "Čeština", englishName: "Czech" },
  { code: "hu", name: "Magyar", englishName: "Hungarian" },
  { code: "ro", name: "Română", englishName: "Romanian" },
  { code: "th", name: "ไทย", englishName: "Thai" },
  { code: "vi", name: "Tiếng Việt", englishName: "Vietnamese" },
  { code: "id", name: "Bahasa Indonesia", englishName: "Indonesian" },
  { code: "ms", name: "Bahasa Melayu", englishName: "Malay" },
  { code: "hi", name: "हिन्दी", englishName: "Hindi" },
  { code: "bn", name: "বাংলা", englishName: "Bengali" },
  { code: "ur", name: "اردو", englishName: "Urdu", rtl: true },
  { code: "fa", name: "فارسی", englishName: "Persian", rtl: true },
  { code: "he", name: "עברית", englishName: "Hebrew", rtl: true },
];

export function findLanguage(code: string): Language | undefined {
  return SUPPORTED_LANGUAGES.find(l => l.code === code);
}
