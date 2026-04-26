import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Upload,
  FileText,
  Zap,
  History,
  AlertCircle,
  CheckCircle,
  Settings as SettingsIcon,
  ArrowLeftRight,
  BookOpen,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import { useTranslation } from "@/hooks/useTranslation";
import { LanguagePicker } from "@/components/LanguagePicker";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  XenobladeSettings,
  useTranslationSettings,
} from "@/components/XenobladeSettings";

const SUPPORTED_FORMATS = [
  "TXT",
  "SRT",
  "VTT",
  "JSON",
  "EPUB",
  "DOCX",
  "MD",
  "HTML",
  "CSV",
  "YAML",
];
const ACCEPT_ATTRIBUTE =
  ".epub,.docx,.txt,.srt,.vtt,.json,.md,.markdown,.html,.htm,.xhtml,.csv,.yaml,.yml";
const MAX_FILE_SIZE_MB = 25;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState("ar");
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { settings } = useTranslationSettings();
  const {
    isLoading,
    progress,
    status,
    error,
    translatedFileUrl,
    failedChunks,
    totalChunks,
    translateFile,
    cancelActive,
    reset,
  } = useTranslation();

  const fileExt = useMemo(
    () => selectedFile?.name.split(".").pop()?.toLowerCase() ?? "",
    [selectedFile]
  );
  const isJsonFile = fileExt === "json";

  useEffect(() => {
    if (status === "completed") {
      toast.success("تمت الترجمة بنجاح");
    } else if (status === "error" && error) {
      toast.error(error);
    }
  }, [status, error]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const validateAndSetFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toUpperCase();
    const aliasMap: Record<string, string> = {
      MARKDOWN: "MD",
      HTM: "HTML",
      XHTML: "HTML",
      YML: "YAML",
    };
    const normalizedExt = ext ? aliasMap[ext] ?? ext : "";
    if (!normalizedExt || !SUPPORTED_FORMATS.includes(normalizedExt)) {
      toast.error(
        `صيغة غير مدعومة. الصيغ المسموحة: ${SUPPORTED_FORMATS.join(", ")}`
      );
      return;
    }
    const sizeMb = file.size / 1024 / 1024;
    if (sizeMb > MAX_FILE_SIZE_MB) {
      toast.error(
        `حجم الملف كبير جداً (${sizeMb.toFixed(1)} MB). الحد الأقصى ${MAX_FILE_SIZE_MB} MB.`
      );
      return;
    }
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer.files;
    if (files && files[0]) validateAndSetFile(files[0]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleSwap = () => {
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
  };

  const handleTranslate = async () => {
    if (!selectedFile) return;
    if (sourceLanguage === targetLanguage) {
      toast.error("لغة المصدر ولغة الهدف يجب أن تكونا مختلفتين");
      return;
    }
    try {
      await translateFile(
        selectedFile,
        sourceLanguage,
        targetLanguage,
        settings
      );
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
              onClick={() => (window.location.href = getLoginUrl())}
            >
              تسجيل الدخول
            </Button>
            <div className="flex justify-center pt-2">
              <ThemeToggle />
            </div>
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
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent/10 rounded-lg">
                <Zap className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  مترجم الكتب
                </h1>
                <p className="text-xs text-muted-foreground">
                  ترجمة ذكية للملفات
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm text-muted-foreground">مرحباً</p>
                <p className="font-semibold text-foreground">
                  {user?.name || "المستخدم"}
                </p>
              </div>
              <ThemeToggle />
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
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <CheckCircle className="w-8 h-8 text-green-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-foreground">
                    تمت الترجمة بنجاح!
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {failedChunks > 0
                      ? `الملف جاهز — ${failedChunks} جزء استُخدم النص الأصلي بسبب فشل في الترجمة`
                      : "الملف جاهز للتنزيل"}
                  </p>
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
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <AlertCircle className="w-8 h-8 text-destructive flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-foreground">
                    حدث خطأ في الترجمة
                  </p>
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
          <div className="md:col-span-2">
            <Card className="border-accent/20 shadow-lg overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-accent" />
                  رفع الملف
                </CardTitle>
                <CardDescription>
                  الصيغ المدعومة: {SUPPORTED_FORMATS.join("، ")} · الحد الأقصى{" "}
                  {MAX_FILE_SIZE_MB} MB
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
                    accept={ACCEPT_ATTRIBUTE}
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
                    type="button"
                    aria-label="اختيار ملف"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isLoading}
                  />
                </div>

                {selectedFile && !isLoading && (
                  <div className="mt-6 p-4 bg-accent/5 border border-accent/20 rounded-lg">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="w-4 h-4 text-accent" />
                      <p className="text-sm font-semibold text-foreground">
                        {selectedFile.name}
                      </p>
                      <span className="text-xs text-muted-foreground">·</span>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(selectedFile.size)}
                      </p>
                      {isJsonFile && (
                        <span className="ml-auto text-xs px-2 py-0.5 rounded bg-accent/15 text-accent">
                          سيتم اكتشاف Xenoblade JSON تلقائياً
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Progress Bar */}
                {isLoading && (
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">
                        {status === "uploading"
                          ? "جاري الرفع..."
                          : totalChunks > 0
                            ? `جاري ترجمة ${totalChunks} جزء...`
                            : "جاري الترجمة..."}
                      </p>
                      <p className="text-sm font-semibold text-accent">
                        {Math.round(progress)}%
                      </p>
                    </div>
                    <div
                      className="w-full h-3 bg-card rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={Math.round(progress)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full bg-gradient-to-r from-accent to-accent/70 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    {status === "translating" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-destructive/50 text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          cancelActive();
                          toast.info("جاري إلغاء العملية...");
                        }}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        إلغاء العملية
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Advanced settings */}
            <div className="mt-6">
              <button
                onClick={() => setShowSettings(v => !v)}
                className="flex items-center gap-2 text-sm text-accent hover:opacity-80 transition-opacity"
              >
                <SettingsIcon className="w-4 h-4" />
                {showSettings
                  ? "إخفاء الإعدادات المتقدمة"
                  : "عرض الإعدادات المتقدمة"}
              </button>
              {showSettings && (
                <div className="mt-4">
                  <XenobladeSettings isOpen />
                </div>
              )}
            </div>
          </div>

          {/* Settings Card */}
          <div>
            <Card className="border-accent/20 shadow-lg sticky top-24">
              <CardHeader>
                <CardTitle className="text-lg">اللغات</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    لغة المصدر
                  </label>
                  <LanguagePicker
                    value={sourceLanguage}
                    onChange={setSourceLanguage}
                    disabled={isLoading}
                    ariaLabel="اختيار لغة المصدر"
                  />
                </div>

                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleSwap}
                    disabled={isLoading}
                    aria-label="تبديل اللغات"
                    className="rounded-full border-border/50"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    لغة الهدف
                  </label>
                  <LanguagePicker
                    value={targetLanguage}
                    onChange={setTargetLanguage}
                    disabled={isLoading}
                    ariaLabel="اختيار لغة الهدف"
                  />
                </div>

                <Button
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground mt-4"
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

                <Button
                  variant="outline"
                  className="w-full border-border/50 hover:bg-card"
                  onClick={() => (window.location.href = "/history")}
                  disabled={isLoading}
                >
                  <History className="w-4 h-4 mr-2" />
                  السجل
                </Button>

                <Button
                  variant="outline"
                  className="w-full border-border/50 hover:bg-card"
                  onClick={() => (window.location.href = "/glossary")}
                  disabled={isLoading}
                >
                  <BookOpen className="w-4 h-4 mr-2" />
                  القاموس
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
                    {SUPPORTED_FORMATS.join("، ")}
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
                  <p className="font-semibold text-foreground">
                    معالجة متوازية
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ترجمة الأجزاء بالتوازي مع إعادة المحاولة عند الفشل
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
                  <p className="font-semibold text-foreground">حماية الصيغ</p>
                  <p className="text-sm text-muted-foreground">
                    SRT بتوقيتاته، JSON ببنيته، علامات XENO وSystem وML
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
