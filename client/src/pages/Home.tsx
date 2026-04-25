import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Zap, History, AlertCircle, CheckCircle } from "lucide-react";
import { useState, useRef } from "react";
import { getLoginUrl } from "@/const";
import { useTranslation } from "@/hooks/useTranslation";

const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "ar", name: "العربية" },
  { code: "fr", name: "Français" },
  { code: "es", name: "Español" },
  { code: "de", name: "Deutsch" },
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
  { code: "ru", name: "Русский" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "zh", name: "中文" },
  { code: "tr", name: "Türkçe" },
  { code: "pl", name: "Polski" },
  { code: "nl", name: "Nederlands" },
  { code: "sv", name: "Svenska" },
  { code: "no", name: "Norsk" },
  { code: "da", name: "Dansk" },
  { code: "fi", name: "Suomi" },
  { code: "el", name: "Ελληνικά" },
  { code: "cs", name: "Čeština" },
  { code: "hu", name: "Magyar" },
  { code: "ro", name: "Română" },
  { code: "th", name: "ไทย" },
  { code: "vi", name: "Tiếng Việt" },
  { code: "id", name: "Bahasa Indonesia" },
  { code: "ms", name: "Bahasa Melayu" },
  { code: "hi", name: "हिन्दी" },
  { code: "bn", name: "বাংলা" },
  { code: "ur", name: "اردو" },
  { code: "fa", name: "فارسی" },
  { code: "he", name: "עברית" },
];

const SUPPORTED_FORMATS = ["EPUB", "DOCX", "TXT", "SRT"];

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState("ar");
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isLoading, progress, status, error, translatedFileUrl, translateFile, reset } = useTranslation();

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      const file = files[0];
      const ext = file.name.split(".").pop()?.toUpperCase();
      if (SUPPORTED_FORMATS.includes(ext || "")) {
        setSelectedFile(file);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleTranslate = async () => {
    if (!selectedFile) return;

    try {
      await translateFile(selectedFile, sourceLanguage, targetLanguage);
    } catch (err) {
      console.error("Translation error:", err);
    }
  };

  const handleDownload = () => {
    if (translatedFileUrl) {
      window.open(translatedFileUrl, "_blank");
    }
  };

  const handleNewTranslation = () => {
    reset();
    setSelectedFile(null);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-card to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-accent/20 shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-accent to-accent/70 bg-clip-text text-transparent">
              مترجم الكتب الذكي
            </CardTitle>
            <CardDescription className="mt-2 text-base">
              ترجم كتبك وملفاتك باستخدام الذكاء الاصطناعي
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              ادخل إلى حسابك لبدء ترجمة الملفات بسهولة
            </p>
            <Button
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
              onClick={() => window.location.href = getLoginUrl()}
            >
              تسجيل الدخول
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card to-background">
      {/* Header */}
      <div className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent/10 rounded-lg">
                <Zap className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">مترجم الكتب</h1>
                <p className="text-xs text-muted-foreground">ترجمة ذكية للملفات</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">مرحبا</p>
              <p className="font-semibold text-foreground">{user?.name || "المستخدم"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container py-8 space-y-8">
        {/* Translation Complete State */}
        {status === "completed" && translatedFileUrl && (
          <Card className="border-green-500/50 bg-green-500/5">
            <CardContent className="py-6">
              <div className="flex items-center gap-4">
                <CheckCircle className="w-8 h-8 text-green-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-foreground">تمت الترجمة بنجاح!</p>
                  <p className="text-sm text-muted-foreground">الملف جاهز للتنزيل</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-green-500 hover:bg-green-600 text-white"
                    onClick={handleDownload}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    تنزيل
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-border/50"
                    onClick={handleNewTranslation}
                  >
                    ترجمة جديدة
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {status === "error" && error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="py-6">
              <div className="flex items-center gap-4">
                <AlertCircle className="w-8 h-8 text-destructive flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-foreground">حدث خطأ في الترجمة</p>
                  <p className="text-sm text-muted-foreground">{error}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-border/50"
                  onClick={handleNewTranslation}
                >
                  حاول مرة أخرى
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upload Section */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Upload Card */}
          <div className="md:col-span-2">
            <Card className="border-accent/20 shadow-lg overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-accent" />
                  رفع الملف
                </CardTitle>
                <CardDescription>
                  ادعم صيغ: {SUPPORTED_FORMATS.join("، ")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-all cursor-pointer ${
                    dragActive
                      ? "border-accent bg-accent/5"
                      : "border-border/50 hover:border-accent/50 bg-card/50"
                  } ${isLoading ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                    accept=".epub,.docx,.txt,.srt"
                    disabled={isLoading}
                  />

                  <div className="space-y-3">
                    <div className="flex justify-center">
                      <div className="p-4 bg-accent/10 rounded-full">
                        <FileText className="w-8 h-8 text-accent" />
                      </div>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        اسحب الملف هنا
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        أو انقر لاختيار ملف من جهازك
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isLoading}
                  />
                </div>

                {selectedFile && !isLoading && (
                  <div className="mt-6 p-4 bg-accent/5 border border-accent/20 rounded-lg">
                    <p className="text-sm font-semibold text-foreground">
                      ✓ الملف المختار:
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      الحجم: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                )}

                {/* Progress Bar */}
                {isLoading && (
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">
                        {status === "uploading" ? "جاري الرفع..." : "جاري الترجمة..."}
                      </p>
                      <p className="text-sm font-semibold text-accent">
                        {Math.round(progress)}%
                      </p>
                    </div>
                    <div className="w-full h-3 bg-card rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-accent to-accent/70 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Settings Card */}
          <div>
            <Card className="border-accent/20 shadow-lg sticky top-24">
              <CardHeader>
                <CardTitle className="text-lg">الإعدادات</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Source Language */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    لغة المصدر
                  </label>
                  <Select value={sourceLanguage} onValueChange={setSourceLanguage} disabled={isLoading}>
                    <SelectTrigger className="bg-card border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_LANGUAGES.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Target Language */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    لغة الهدف
                  </label>
                  <Select value={targetLanguage} onValueChange={setTargetLanguage} disabled={isLoading}>
                    <SelectTrigger className="bg-card border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_LANGUAGES.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Translate Button */}
                <Button
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground mt-8"
                  disabled={!selectedFile || isLoading}
                  onClick={handleTranslate}
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin mr-2" />
                      جاري المعالجة...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      ابدأ الترجمة
                    </>
                  )}
                </Button>

                {/* History Button */}
                <Button
                  variant="outline"
                  className="w-full border-border/50 hover:bg-card"
                  onClick={() => window.location.href = '/history'}
                  disabled={isLoading}
                >
                  <History className="w-4 h-4 mr-2" />
                  السجل
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="border-border/50 bg-card/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-accent/10 rounded-lg">
                  <FileText className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">صيغ متعددة</p>
                  <p className="text-sm text-muted-foreground">
                    ادعم EPUB و DOCX و TXT و SRT
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-accent/10 rounded-lg">
                  <Zap className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">ترجمة ذكية</p>
                  <p className="text-sm text-muted-foreground">
                    تقسيم ذكي للنص مع الحفاظ على السياق
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-accent/10 rounded-lg">
                  <Upload className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">الحفاظ على التنسيق</p>
                  <p className="text-sm text-muted-foreground">
                    الملف المترجم يحتفظ بالتنسيق الأصلي
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
