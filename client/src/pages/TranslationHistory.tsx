import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Download, Trash2, Clock, CheckCircle, AlertCircle, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";

export default function TranslationHistory() {
  const { user, isAuthenticated } = useAuth();
  const [selectedTranslation, setSelectedTranslation] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | "all">("all");

  // جلب قائمة الترجمات
  const { data: translations = [], isLoading } = trpc.translation.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // تصفية البيانات بناءً على البحث والحالة
  const filteredTranslations = useMemo(() => {
    return translations.filter((translation) => {
      const matchesSearch =
        searchQuery === "" ||
        translation.sourceLanguage.toLowerCase().includes(searchQuery.toLowerCase()) ||
        translation.targetLanguage.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        filterStatus === "all" || translation.status === filterStatus;

      return matchesSearch && matchesStatus;
    });
  }, [translations, searchQuery, filterStatus]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">مكتمل</span>
          </div>
        );
      case "processing":
        return (
          <div className="flex items-center gap-2 text-blue-400">
            <Clock className="w-4 h-4 animate-spin" />
            <span className="text-sm">جاري المعالجة</span>
          </div>
        );
      case "failed":
        return (
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">فشل</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span className="text-sm">{status}</span>
          </div>
        );
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-card to-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>تسجيل الدخول مطلوب</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              يرجى تسجيل الدخول لعرض سجل الترجمات
            </p>
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
            <div>
              <h1 className="text-2xl font-bold text-foreground">سجل الترجمات</h1>
              <p className="text-sm text-muted-foreground">عرض جميع الترجمات السابقة</p>
            </div>
            <Button
              variant="outline"
              className="border-border/50"
              onClick={() => window.location.href = '/'}
            >
              ترجمة جديدة
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container py-8">
        {/* Search and Filter */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="ابحث عن اللغات..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-card border-border/50"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setFilterStatus("all")}
              className={`px-4 py-2 rounded-lg transition-all text-sm font-medium ${
                filterStatus === "all"
                  ? "bg-accent text-accent-foreground"
                  : "bg-card border border-border/50 text-foreground hover:border-accent/50"
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setFilterStatus("completed")}
              className={`px-4 py-2 rounded-lg transition-all text-sm font-medium ${
                filterStatus === "completed"
                  ? "bg-green-500/20 text-green-400 border border-green-500/50"
                  : "bg-card border border-border/50 text-foreground hover:border-accent/50"
              }`}
            >
              مكتمل
            </button>
            <button
              onClick={() => setFilterStatus("processing")}
              className={`px-4 py-2 rounded-lg transition-all text-sm font-medium ${
                filterStatus === "processing"
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/50"
                  : "bg-card border border-border/50 text-foreground hover:border-accent/50"
              }`}
            >
              جاري
            </button>
            <button
              onClick={() => setFilterStatus("failed")}
              className={`px-4 py-2 rounded-lg transition-all text-sm font-medium ${
                filterStatus === "failed"
                  ? "bg-red-500/20 text-red-400 border border-red-500/50"
                  : "bg-card border border-border/50 text-foreground hover:border-accent/50"
              }`}
            >
              فشل
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-muted-foreground">جاري تحميل السجل...</p>
            </div>
          </div>
        ) : filteredTranslations.length === 0 ? (
          <Card className="border-border/50 bg-card/50">
            <CardContent className="py-12 text-center">
              <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-lg font-semibold text-foreground mb-2">
                {searchQuery || filterStatus !== "all" ? "لا توجد نتائج" : "لا توجد ترجمات"}
              </p>
              <p className="text-sm text-muted-foreground">
                {searchQuery || filterStatus !== "all"
                  ? "حاول تغيير معايير البحث"
                  : "ابدأ بترجمة ملف جديد لعرضه هنا"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredTranslations.map((translation) => (
              <Card
                key={translation.id}
                className={`border-border/50 cursor-pointer transition-all hover:border-accent/50 ${
                  selectedTranslation === translation.id ? "border-accent/50 bg-accent/5" : ""
                }`}
                onClick={() => setSelectedTranslation(selectedTranslation === translation.id ? null : translation.id)}
              >
                <CardContent className="py-6">
                  <div className="grid md:grid-cols-5 gap-4 items-center">
                    {/* Languages */}
                    <div className="md:col-span-1">
                      <p className="text-xs text-muted-foreground mb-1">اللغات</p>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-card rounded text-xs font-semibold">
                          {translation.sourceLanguage.toUpperCase()}
                        </span>
                        <span className="text-muted-foreground">←</span>
                        <span className="px-2 py-1 bg-accent/10 rounded text-xs font-semibold text-accent">
                          {translation.targetLanguage.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="md:col-span-1">
                      <p className="text-xs text-muted-foreground mb-1">الحالة</p>
                      {getStatusBadge(translation.status)}
                    </div>

                    {/* Progress */}
                    <div className="md:col-span-1">
                      <p className="text-xs text-muted-foreground mb-1">التقدم</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-card rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent transition-all"
                            style={{ width: `${translation.progress}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-foreground">
                          {Math.round(translation.progress)}%
                        </span>
                      </div>
                    </div>

                    {/* Date */}
                    <div className="md:col-span-1">
                      <p className="text-xs text-muted-foreground mb-1">التاريخ</p>
                      <p className="text-sm text-foreground">
                        {formatDate(translation.createdAt)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="md:col-span-1 flex gap-2">
                      {translation.status === "completed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 border-border/50 hover:bg-accent/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (translation.translatedFileUrl) {
                              window.open(translation.translatedFileUrl, "_blank");
                            }
                          }}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-border/50 hover:bg-destructive/10 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          // حذف الترجمة
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {selectedTranslation === translation.id && (
                    <div className="mt-6 pt-6 border-t border-border/50 space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">إجمالي الأجزاء</p>
                          <p className="text-lg font-semibold text-foreground">
                            {translation.totalChunks}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">الأجزاء المعالجة</p>
                          <p className="text-lg font-semibold text-foreground">
                            {translation.processedChunks}
                          </p>
                        </div>
                      </div>

                      {translation.errorMessage && (
                        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
                          {translation.errorMessage}
                        </div>
                      )}

                      {translation.completedAt && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">وقت الإكمال</p>
                          <p className="text-sm text-foreground">
                            {formatDate(translation.completedAt)}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Stats */}
        {translations.length > 0 && (
          <div className="mt-8 grid md:grid-cols-4 gap-4">
            <Card className="border-border/50 bg-card/50">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-1">إجمالي الترجمات</p>
                <p className="text-2xl font-bold text-foreground">{translations.length}</p>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-1">مكتملة</p>
                <p className="text-2xl font-bold text-green-400">
                  {translations.filter((t) => t.status === "completed").length}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-1">جاري المعالجة</p>
                <p className="text-2xl font-bold text-blue-400">
                  {translations.filter((t) => t.status === "processing").length}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-1">فشلت</p>
                <p className="text-2xl font-bold text-red-400">
                  {translations.filter((t) => t.status === "failed").length}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
