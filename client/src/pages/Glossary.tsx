import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguagePicker } from "@/components/LanguagePicker";
import { findLanguage } from "@/lib/languages";
import {
  BookOpen,
  Plus,
  Search,
  Trash2,
  Save,
  Pencil,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface DraftEntry {
  id?: number;
  term: string;
  translation: string;
  notes: string;
  sourceLanguage: string;
  targetLanguage: string;
}

const EMPTY_DRAFT: DraftEntry = {
  term: "",
  translation: "",
  notes: "",
  sourceLanguage: "",
  targetLanguage: "",
};

export default function Glossary() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const { data: entries = [], isLoading } = trpc.glossary.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const createMutation = trpc.glossary.create.useMutation({
    onSuccess: () => {
      utils.glossary.list.invalidate();
      toast.success("تمت الإضافة");
      setDraft(EMPTY_DRAFT);
      setEditing(false);
    },
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.glossary.update.useMutation({
    onSuccess: () => {
      utils.glossary.list.invalidate();
      toast.success("تم التحديث");
      setDraft(EMPTY_DRAFT);
      setEditing(false);
    },
    onError: e => toast.error(e.message),
  });
  const deleteMutation = trpc.glossary.delete.useMutation({
    onSuccess: () => {
      utils.glossary.list.invalidate();
      toast.success("تم الحذف");
    },
    onError: e => toast.error(e.message),
  });

  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<DraftEntry>(EMPTY_DRAFT);
  const [editing, setEditing] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e =>
      [e.term, e.translation, e.notes ?? "", e.sourceLanguage ?? "", e.targetLanguage ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [entries, search]);

  const handleSubmit = () => {
    if (!draft.term.trim() || !draft.translation.trim()) {
      toast.error("يجب إدخال المصطلح والترجمة");
      return;
    }
    const payload = {
      term: draft.term.trim(),
      translation: draft.translation.trim(),
      notes: draft.notes.trim() || undefined,
      sourceLanguage: draft.sourceLanguage || undefined,
      targetLanguage: draft.targetLanguage || undefined,
    };
    if (draft.id) {
      updateMutation.mutate({ id: draft.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (entry: (typeof entries)[number]) => {
    setEditing(true);
    setDraft({
      id: entry.id,
      term: entry.term,
      translation: entry.translation,
      notes: entry.notes ?? "",
      sourceLanguage: entry.sourceLanguage ?? "",
      targetLanguage: entry.targetLanguage ?? "",
    });
  };

  const handleCancelEdit = () => {
    setDraft(EMPTY_DRAFT);
    setEditing(false);
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
              يرجى تسجيل الدخول لإدارة قاموس المصطلحات
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card to-background">
      <div className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="container py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 rounded-lg">
              <BookOpen className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                قاموس الترجمة
              </h1>
              <p className="text-sm text-muted-foreground">
                مصطلحات يتم حقنها داخل سياق الترجمة لكل ملف
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="outline"
              className="border-border/50"
              onClick={() => (window.location.href = "/")}
            >
              العودة
            </Button>
          </div>
        </div>
      </div>

      <div className="container py-8 grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 border-accent/20 shadow-lg sticky top-24 self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {editing ? (
                <>
                  <Pencil className="w-5 h-5 text-accent" /> تعديل مصطلح
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5 text-accent" /> إضافة مصطلح
                </>
              )}
            </CardTitle>
            <CardDescription>
              يُحقن المصطلح داخل تعليمات الترجمة كقائمة قاموس.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>المصطلح الأصلي</Label>
              <Input
                value={draft.term}
                onChange={e => setDraft({ ...draft, term: e.target.value })}
                placeholder="Shulk"
              />
            </div>
            <div className="space-y-1">
              <Label>الترجمة</Label>
              <Input
                value={draft.translation}
                onChange={e =>
                  setDraft({ ...draft, translation: e.target.value })
                }
                placeholder="شولك"
              />
            </div>
            <div className="space-y-1">
              <Label>ملاحظات (اختياري)</Label>
              <Textarea
                value={draft.notes}
                onChange={e => setDraft({ ...draft, notes: e.target.value })}
                placeholder="اسم بطل من Xenoblade Chronicles 1"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>لغة المصدر (اختياري)</Label>
                <LanguagePicker
                  value={draft.sourceLanguage}
                  onChange={code =>
                    setDraft({ ...draft, sourceLanguage: code })
                  }
                  placeholder="أي لغة"
                  ariaLabel="لغة المصدر"
                />
              </div>
              <div className="space-y-1">
                <Label>لغة الهدف (اختياري)</Label>
                <LanguagePicker
                  value={draft.targetLanguage}
                  onChange={code =>
                    setDraft({ ...draft, targetLanguage: code })
                  }
                  placeholder="أي لغة"
                  ariaLabel="لغة الهدف"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
                onClick={handleSubmit}
                disabled={
                  createMutation.isPending || updateMutation.isPending
                }
              >
                <Save className="w-4 h-4 mr-2" />
                {draft.id ? "حفظ التعديلات" : "حفظ"}
              </Button>
              {editing && (
                <Button
                  variant="outline"
                  className="border-border/50"
                  onClick={handleCancelEdit}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="md:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="ابحث عن مصطلح..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 bg-card border-border/50"
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-10 h-10 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <Card className="border-border/50 bg-card/50">
              <CardContent className="py-12 text-center">
                <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <p className="text-lg font-semibold text-foreground mb-1">
                  {search ? "لا توجد نتائج" : "القاموس فارغ"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {search
                    ? "جرّب كلمة بحث أخرى"
                    : "أضف مصطلحاتك من النموذج على اليسار"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map(entry => {
                const src = findLanguage(entry.sourceLanguage ?? "");
                const tgt = findLanguage(entry.targetLanguage ?? "");
                return (
                  <Card
                    key={entry.id}
                    className="border-border/50 hover:border-accent/40 transition-colors"
                  >
                    <CardContent className="py-4 grid md:grid-cols-5 gap-3 items-start">
                      <div className="md:col-span-2">
                        <p className="text-xs text-muted-foreground mb-1">
                          المصطلح
                        </p>
                        <p className="font-semibold text-foreground break-words">
                          {entry.term}
                        </p>
                      </div>
                      <div className="md:col-span-2">
                        <p className="text-xs text-muted-foreground mb-1">
                          الترجمة
                        </p>
                        <p className="font-semibold text-accent break-words">
                          {entry.translation}
                        </p>
                        {entry.notes && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {entry.notes}
                          </p>
                        )}
                        {(src || tgt) && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {src
                              ? `${src.name} (${src.code.toUpperCase()})`
                              : "أي مصدر"}
                            {" → "}
                            {tgt
                              ? `${tgt.name} (${tgt.code.toUpperCase()})`
                              : "أي هدف"}
                          </p>
                        )}
                      </div>
                      <div className="md:col-span-1 flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-border/50"
                          onClick={() => handleEdit(entry)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-border/50 text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm("هل أنت متأكد من الحذف؟")) {
                              deleteMutation.mutate({ id: entry.id });
                            }
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
