import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertCircle, Settings } from "lucide-react";

interface XenobladeSettingsProps {
  onSettingsChange?: (settings: XenobladeTranslationSettings) => void;
  isOpen?: boolean;
}

export interface XenobladeTranslationSettings {
  preserveXenoTags: boolean;
  preserveSystemTags: boolean;
  preserveMLTags: boolean;
  excludeJapanese: boolean;
  preserveFormatting: boolean;
}

const DEFAULT_SETTINGS: XenobladeTranslationSettings = {
  preserveXenoTags: true,
  preserveSystemTags: true,
  preserveMLTags: true,
  excludeJapanese: true,
  preserveFormatting: true,
};

export function XenobladeSettings({ onSettingsChange, isOpen = false }: XenobladeSettingsProps) {
  const [settings, setSettings] = useState<XenobladeTranslationSettings>(DEFAULT_SETTINGS);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSettingChange = (key: keyof XenobladeTranslationSettings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    onSettingsChange?.(newSettings);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Card className="border-blue-500/30 bg-blue-950/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-blue-400" />
            <div>
              <CardTitle className="text-lg">إعدادات Xenoblade Chronicles</CardTitle>
              <CardDescription>
                تخصيص معالجة ملفات الترجمة للحفاظ على العلامات والتنسيق
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* القسم الأساسي */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-gray-300">الإعدادات الأساسية</h3>

            <div className="flex items-center space-x-3 space-x-reverse">
              <Checkbox
                id="preserve-xeno"
                checked={settings.preserveXenoTags}
                onCheckedChange={(checked) =>
                  handleSettingChange("preserveXenoTags", checked as boolean)
                }
              />
              <Label htmlFor="preserve-xeno" className="cursor-pointer">
                <div className="font-medium">الحفاظ على علامات XENO</div>
                <div className="text-xs text-gray-400">
                  حماية علامات مثل [XENO:wait] و [XENO:del] من الترجمة
                </div>
              </Label>
            </div>

            <div className="flex items-center space-x-3 space-x-reverse">
              <Checkbox
                id="preserve-system"
                checked={settings.preserveSystemTags}
                onCheckedChange={(checked) =>
                  handleSettingChange("preserveSystemTags", checked as boolean)
                }
              />
              <Label htmlFor="preserve-system" className="cursor-pointer">
                <div className="font-medium">الحفاظ على علامات System</div>
                <div className="text-xs text-gray-400">
                  حماية علامات مثل [System:Color] و [System:PageBreak]
                </div>
              </Label>
            </div>

            <div className="flex items-center space-x-3 space-x-reverse">
              <Checkbox
                id="preserve-ml"
                checked={settings.preserveMLTags}
                onCheckedChange={(checked) =>
                  handleSettingChange("preserveMLTags", checked as boolean)
                }
              />
              <Label htmlFor="preserve-ml" className="cursor-pointer">
                <div className="font-medium">الحفاظ على علامات ML</div>
                <div className="text-xs text-gray-400">
                  حماية علامات مثل [ML:icon] و [ML:space] من الترجمة
                </div>
              </Label>
            </div>
          </div>

          {/* القسم المتقدم */}
          <div className="space-y-4 border-t border-gray-700 pt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
            >
              {showAdvanced ? "▼" : "▶"} الإعدادات المتقدمة
            </button>

            {showAdvanced && (
              <div className="space-y-4 pl-4">
                <div className="flex items-center space-x-3 space-x-reverse">
                  <Checkbox
                    id="exclude-japanese"
                    checked={settings.excludeJapanese}
                    onCheckedChange={(checked) =>
                      handleSettingChange("excludeJapanese", checked as boolean)
                    }
                  />
                  <Label htmlFor="exclude-japanese" className="cursor-pointer">
                    <div className="font-medium">استبعاد النصوص اليابانية</div>
                    <div className="text-xs text-gray-400">
                      عدم ترجمة النصوص المكتوبة بالأحرف اليابانية
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-3 space-x-reverse">
                  <Checkbox
                    id="preserve-formatting"
                    checked={settings.preserveFormatting}
                    onCheckedChange={(checked) =>
                      handleSettingChange("preserveFormatting", checked as boolean)
                    }
                  />
                  <Label htmlFor="preserve-formatting" className="cursor-pointer">
                    <div className="font-medium">الحفاظ على التنسيق</div>
                    <div className="text-xs text-gray-400">
                      الحفاظ على المسافات والفواصل والأسطر الجديدة
                    </div>
                  </Label>
                </div>
              </div>
            )}
          </div>

          {/* تنبيه المعلومات */}
          <div className="flex gap-3 rounded-lg bg-amber-950/30 p-3 border border-amber-700/30">
            <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-200">
              <p className="font-medium mb-1">ملاحظة مهمة:</p>
              <p>
                هذه الإعدادات تضمن الحفاظ على جميع العلامات التقنية والتنسيق الأصلي في ملفات
                Xenoblade Chronicles. يُنصح بتفعيل جميع الخيارات للحصول على أفضل النتائج.
              </p>
            </div>
          </div>

          {/* زر إعادة التعيين */}
          <Button
            variant="outline"
            onClick={() => {
              setSettings(DEFAULT_SETTINGS);
              onSettingsChange?.(DEFAULT_SETTINGS);
            }}
            className="w-full"
          >
            إعادة تعيين الإعدادات الافتراضية
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function getXenobladeSettingsDescription(settings: XenobladeTranslationSettings): string {
  const enabled = [];

  if (settings.preserveXenoTags) enabled.push("علامات XENO");
  if (settings.preserveSystemTags) enabled.push("علامات System");
  if (settings.preserveMLTags) enabled.push("علامات ML");
  if (settings.excludeJapanese) enabled.push("استبعاد اليابانية");
  if (settings.preserveFormatting) enabled.push("الحفاظ على التنسيق");

  return `الحماية المفعلة: ${enabled.join("، ")}`;
}
