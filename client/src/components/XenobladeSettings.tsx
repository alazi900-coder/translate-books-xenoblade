import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { AlertCircle, Settings } from "lucide-react";

interface XenobladeSettingsProps {
  onSettingsChange?: (settings: TranslationSettings) => void;
  isOpen?: boolean;
}

export interface TranslationSettings {
  preserveXenoTags: boolean;
  preserveSystemTags: boolean;
  preserveMLTags: boolean;
  excludeJapanese: boolean;
  preserveFormatting: boolean;
  /** Maximum words per chunk for plain text/SRT/EPUB pipelines. */
  chunkSize: number;
  /** LLM model identifier (e.g. gemini-2.5-flash). */
  model: string;
  /** Sampling temperature 0..2. */
  temperature: number;
  /** Inject the user's glossary into translation prompts. */
  useGlossary: boolean;
}

export const AVAILABLE_MODELS: Array<{ id: string; label: string }> = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (سريع و افتراضي)" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (أعلى جودة، أبطأ)" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
  { id: "gpt-4o", label: "GPT-4o" },
];

// Backwards-compat alias for older imports.
export type XenobladeTranslationSettings = TranslationSettings;

export const DEFAULT_SETTINGS: TranslationSettings = {
  preserveXenoTags: true,
  preserveSystemTags: true,
  preserveMLTags: true,
  excludeJapanese: true,
  preserveFormatting: true,
  chunkSize: 500,
  model: "gemini-2.5-flash",
  temperature: 0.3,
  useGlossary: true,
};

const STORAGE_KEY = "translation-settings:v1";

function loadSettings(): TranslationSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<TranslationSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: TranslationSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function useTranslationSettings() {
  const [settings, setSettings] = useState<TranslationSettings>(loadSettings);
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);
  return { settings, setSettings };
}

export function XenobladeSettings({
  onSettingsChange,
  isOpen = false,
}: XenobladeSettingsProps) {
  const { settings, setSettings } = useTranslationSettings();
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    onSettingsChange?.(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const handleToggle = (key: keyof TranslationSettings, value: boolean) => {
    setSettings({ ...settings, [key]: value });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Card className="border-accent/30 bg-card/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-accent" />
            <div>
              <CardTitle className="text-lg">
                إعدادات الترجمة المتقدمة
              </CardTitle>
              <CardDescription>
                خيارات معالجة ملفات Xenoblade Chronicles وتخصيص حجم الأجزاء
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* القسم الأساسي */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground">
              حماية العلامات التقنية
            </h3>

            <div className="flex items-center gap-3">
              <Checkbox
                id="preserve-xeno"
                checked={settings.preserveXenoTags}
                onCheckedChange={checked =>
                  handleToggle("preserveXenoTags", checked as boolean)
                }
              />
              <Label htmlFor="preserve-xeno" className="cursor-pointer">
                <div className="font-medium">الحفاظ على علامات XENO</div>
                <div className="text-xs text-muted-foreground">
                  حماية علامات مثل [XENO:wait] و [XENO:del] من الترجمة
                </div>
              </Label>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="preserve-system"
                checked={settings.preserveSystemTags}
                onCheckedChange={checked =>
                  handleToggle("preserveSystemTags", checked as boolean)
                }
              />
              <Label htmlFor="preserve-system" className="cursor-pointer">
                <div className="font-medium">الحفاظ على علامات System</div>
                <div className="text-xs text-muted-foreground">
                  حماية [System:Color] و [System:PageBreak]
                </div>
              </Label>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="preserve-ml"
                checked={settings.preserveMLTags}
                onCheckedChange={checked =>
                  handleToggle("preserveMLTags", checked as boolean)
                }
              />
              <Label htmlFor="preserve-ml" className="cursor-pointer">
                <div className="font-medium">الحفاظ على علامات ML</div>
                <div className="text-xs text-muted-foreground">
                  حماية [ML:icon] و [ML:space] من الترجمة
                </div>
              </Label>
            </div>
          </div>

          {/* القسم المتقدم */}
          <div className="space-y-4 border-t border-border/50 pt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm font-medium text-accent hover:opacity-80 transition-colors"
            >
              {showAdvanced ? "▼" : "▶"} الإعدادات المتقدمة
            </button>

            {showAdvanced && (
              <div className="space-y-4 ps-4">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="exclude-japanese"
                    checked={settings.excludeJapanese}
                    onCheckedChange={checked =>
                      handleToggle("excludeJapanese", checked as boolean)
                    }
                  />
                  <Label htmlFor="exclude-japanese" className="cursor-pointer">
                    <div className="font-medium">استبعاد النصوص اليابانية</div>
                    <div className="text-xs text-muted-foreground">
                      تجاهل النصوص المكتوبة بالأحرف اليابانية تلقائياً
                    </div>
                  </Label>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="preserve-formatting"
                    checked={settings.preserveFormatting}
                    onCheckedChange={checked =>
                      handleToggle("preserveFormatting", checked as boolean)
                    }
                  />
                  <Label
                    htmlFor="preserve-formatting"
                    className="cursor-pointer"
                  >
                    <div className="font-medium">الحفاظ على التنسيق</div>
                    <div className="text-xs text-muted-foreground">
                      الحفاظ على المسافات والفواصل والأسطر الجديدة
                    </div>
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="chunk-size" className="font-medium">
                    حجم الجزء (كلمة): {settings.chunkSize}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    عدد الكلمات في كل جزء يُرسل إلى نموذج الترجمة. القيمة الأصغر
                    أكثر دقة لكنها أبطأ.
                  </p>
                  <Slider
                    id="chunk-size"
                    min={100}
                    max={1500}
                    step={50}
                    value={[settings.chunkSize]}
                    onValueChange={([v]) =>
                      setSettings({ ...settings, chunkSize: v })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model" className="font-medium">
                    نموذج الترجمة
                  </Label>
                  <select
                    id="model"
                    value={settings.model}
                    onChange={e =>
                      setSettings({ ...settings, model: e.target.value })
                    }
                    className="w-full rounded-md border border-border/50 bg-card px-3 py-2 text-sm"
                  >
                    {AVAILABLE_MODELS.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="temperature" className="font-medium">
                    درجة الإبداع (Temperature):{" "}
                    {settings.temperature.toFixed(2)}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    قيمة منخفضة = ترجمة محافظة ومستقرة. قيمة عالية = أكثر تنوّعاً.
                  </p>
                  <Slider
                    id="temperature"
                    min={0}
                    max={2}
                    step={0.05}
                    value={[settings.temperature]}
                    onValueChange={([v]) =>
                      setSettings({ ...settings, temperature: v })
                    }
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="use-glossary"
                    checked={settings.useGlossary}
                    onCheckedChange={checked =>
                      handleToggle("useGlossary", checked as boolean)
                    }
                  />
                  <Label htmlFor="use-glossary" className="cursor-pointer">
                    <div className="font-medium">استخدم القاموس الخاص بي</div>
                    <div className="text-xs text-muted-foreground">
                      ادمج المصطلحات المحفوظة في صفحة /glossary داخل سياق
                      الترجمة
                    </div>
                  </Label>
                </div>
              </div>
            )}
          </div>

          {/* تنبيه المعلومات */}
          <div className="flex gap-3 rounded-lg bg-amber-950/20 dark:bg-amber-950/30 p-3 border border-amber-700/20">
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-700 dark:text-amber-200">
              <p className="font-medium mb-1">ملاحظة:</p>
              <p>
                يُنصح بتفعيل جميع خيارات الحماية للحصول على أفضل النتائج عند
                ترجمة ملفات Xenoblade Chronicles. يُحفظ هذا الإعدادات في متصفحك
                تلقائياً.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => setSettings(DEFAULT_SETTINGS)}
            className="w-full"
          >
            إعادة الإعدادات الافتراضية
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function getSettingsDescription(settings: TranslationSettings): string {
  const enabled: string[] = [];
  if (settings.preserveXenoTags) enabled.push("علامات XENO");
  if (settings.preserveSystemTags) enabled.push("علامات System");
  if (settings.preserveMLTags) enabled.push("علامات ML");
  if (settings.excludeJapanese) enabled.push("استبعاد اليابانية");
  if (settings.preserveFormatting) enabled.push("الحفاظ على التنسيق");
  return enabled.length > 0
    ? `الحماية المفعلة: ${enabled.join("، ")}`
    : "بدون حماية إضافية";
}

// Backwards-compat alias
export const getXenobladeSettingsDescription = getSettingsDescription;
