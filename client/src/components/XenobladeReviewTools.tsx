import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle,
  Download,
  FileSearch,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AVAILABLE_MODELS } from "./XenobladeSettings";

type ReviewMode = "symbols" | "line-split" | "ai" | "all";
type ReviewScope = "all" | "short" | "long" | "with_tags" | "no_arabic";

interface ReviewIssue {
  id: string;
  key: string;
  path: string;
  original: string;
  translation: string;
  suggestion: string;
  kind: "missing-tags" | "extra-tags" | "line-breaks" | "line-split" | "ai-enhance";
  severity: "high" | "medium" | "low";
  reason: string;
  detail: string;
}

const MODES: Array<{ id: ReviewMode; label: string; description: string }> = [
  {
    id: "symbols",
    label: "الرموز وفواصل الأسطر",
    description: "فحص وسوم XENO/System/ML وفواصل الأسطر مثل أداة زيلدا.",
  },
  {
    id: "line-split",
    label: "تقسيم الأسطر",
    description: "اقتراح تقسيم ذكي بدل التقسيم القديم عند الفاصلة.",
  },
  {
    id: "ai",
    label: "تحسين AI",
    description: "مراجعة جودة الترجمة وقواعدها ومصطلحاتها بالذكاء الاصطناعي.",
  },
  {
    id: "all",
    label: "فحص شامل",
    description: "تشغيل الأداتين مع تحسين AI دفعة واحدة.",
  },
];

const SCOPES: Array<{ id: ReviewScope; label: string }> = [
  { id: "all", label: "كل النصوص" },
  { id: "short", label: "القصيرة" },
  { id: "long", label: "الطويلة" },
  { id: "with_tags", label: "تحتوي وسوم" },
  { id: "no_arabic", label: "لا تحتوي عربية" },
];

function issueKindLabel(kind: ReviewIssue["kind"]) {
  switch (kind) {
    case "missing-tags":
      return "وسوم مفقودة";
    case "extra-tags":
      return "وسوم مختلفة";
    case "line-breaks":
      return "فواصل أسطر";
    case "line-split":
      return "تقسيم الأسطر";
    case "ai-enhance":
      return "تحسين AI";
  }
}

function severityClass(severity: ReviewIssue["severity"]) {
  if (severity === "high") return "border-red-500/40 text-red-300";
  if (severity === "medium") return "border-amber-500/40 text-amber-300";
  return "border-blue-500/40 text-blue-300";
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadText(fileName: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function DiffBlocks({ before, after }: { before: string; after: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="min-w-0 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
        <div className="mb-2 text-xs font-semibold text-red-300">قبل</div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-sm leading-7 touch-pan-x touch-pan-y">
          {before}
        </pre>
      </div>
      <div className="min-w-0 rounded-lg border border-green-500/20 bg-green-500/5 p-3">
        <div className="mb-2 text-xs font-semibold text-green-300">بعد</div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-sm leading-7 touch-pan-x touch-pan-y">
          {after}
        </pre>
      </div>
    </div>
  );
}

export function XenobladeReviewTools() {
  const [originalContent, setOriginalContent] = useState("");
  const [translatedContent, setTranslatedContent] = useState("");
  const [fileName, setFileName] = useState("xenoblade.json");
  const [mode, setMode] = useState<ReviewMode>("symbols");
  const [scope, setScope] = useState<ReviewScope>("all");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [issues, setIssues] = useState<ReviewIssue[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const reviewMutation = trpc.translation.reviewXenoblade.useMutation({
    onSuccess: data => {
      setIssues(data.issues as ReviewIssue[]);
      setSelected(
        Object.fromEntries((data.issues as ReviewIssue[]).map(issue => [issue.id, true]))
      );
      setEdits(
        Object.fromEntries(
          (data.issues as ReviewIssue[]).map(issue => [issue.id, issue.suggestion])
        )
      );
      setDownloadUrl(null);
      toast.success(`تم فحص ${data.scanned} نص، ووجدت ${data.issues.length} ملاحظة`);
    },
    onError: error => toast.error(error.message),
  });

  const applyMutation = trpc.translation.applyXenobladeReview.useMutation({
    onSuccess: data => {
      setTranslatedContent(data.output);
      setDownloadUrl(data.url);
      toast.success("تم تطبيق الاقتراحات وإنشاء ملف جديد");
    },
    onError: error => toast.error(error.message),
  });

  const selectedIssues = useMemo(
    () => issues.filter(issue => selected[issue.id]),
    [issues, selected]
  );

  const handleOriginalFile = async (file?: File) => {
    if (!file) return;
    setOriginalContent(await file.text());
  };

  const handleTranslatedFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setTranslatedContent(await file.text());
  };

  const runReview = () => {
    if (!originalContent.trim() || !translatedContent.trim()) {
      toast.error("أضف ملف الأصل وملف الترجمة أولاً");
      return;
    }
    reviewMutation.mutate({
      originalContent,
      translatedContent,
      mode,
      scope,
      model,
      temperature: 0.2,
    });
  };

  const applySelected = () => {
    if (selectedIssues.length === 0) {
      toast.error("اختر اقتراحاً واحداً على الأقل");
      return;
    }
    applyMutation.mutate({
      translatedContent,
      fileName,
      suggestions: selectedIssues.map(issue => ({
        path: issue.path,
        suggestion: edits[issue.id] ?? issue.suggestion,
      })),
    });
  };

  const exportCsv = () => {
    const header = ["key", "path", "type", "severity", "reason", "original", "translation", "suggestion"];
    const rows = issues.map(issue =>
      [
        issue.key,
        issue.path,
        issue.kind,
        issue.severity,
        issue.reason,
        issue.original,
        issue.translation,
        edits[issue.id] ?? issue.suggestion,
      ]
        .map(csvEscape)
        .join(",")
    );
    downloadText("xenoblade-review.csv", [header.join(","), ...rows].join("\n"), "text/csv;charset=utf-8");
  };

  return (
    <Card className="border-accent/30 bg-card/60 shadow-lg">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-accent/10 p-2">
            <Wand2 className="h-5 w-5 text-accent" />
          </div>
          <div>
            <CardTitle>أدوات زيلدا لـ Xenoblade</CardTitle>
            <CardDescription>
              فحص الرموز وفواصل الأسطر وتحسين الترجمة بالذكاء الاصطناعي مع مقارنة قابلة للمس.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="rounded-lg border border-border/60 bg-background/40 p-4">
            <div className="mb-2 text-sm font-semibold">ملف Xenoblade الأصلي</div>
            <input
              type="file"
              accept=".json"
              className="block w-full text-sm"
              onChange={e => handleOriginalFile(e.target.files?.[0])}
            />
          </label>
          <label className="rounded-lg border border-border/60 bg-background/40 p-4">
            <div className="mb-2 text-sm font-semibold">ملف الترجمة العربية</div>
            <input
              type="file"
              accept=".json"
              className="block w-full text-sm"
              onChange={e => handleTranslatedFile(e.target.files?.[0])}
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Textarea
            dir="ltr"
            className="min-h-36 font-mono text-xs"
            placeholder="أو الصق JSON الأصلي هنا"
            value={originalContent}
            onChange={e => setOriginalContent(e.target.value)}
          />
          <Textarea
            dir="ltr"
            className="min-h-36 font-mono text-xs"
            placeholder="أو الصق JSON الترجمة هنا"
            value={translatedContent}
            onChange={e => setTranslatedContent(e.target.value)}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-4">
          {MODES.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              className={`rounded-lg border p-3 text-right transition active:scale-[0.99] ${
                mode === item.id
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border/60 bg-background/40"
              }`}
            >
              <div className="text-sm font-semibold">{item.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{item.description}</div>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <select
            className="min-h-11 rounded-md border border-border bg-background px-3 text-sm"
            value={scope}
            onChange={e => setScope(e.target.value as ReviewScope)}
          >
            {SCOPES.map(item => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            className="min-h-11 rounded-md border border-border bg-background px-3 text-sm"
            value={model}
            onChange={e => setModel(e.target.value)}
          >
            {AVAILABLE_MODELS.map(item => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <Button
            className="min-h-11 bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={runReview}
            disabled={reviewMutation.isPending}
          >
            {reviewMutation.isPending ? (
              <>
                <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                جاري الفحص...
              </>
            ) : (
              <>
                <FileSearch className="mr-2 h-4 w-4" />
                ابدأ الفحص
              </>
            )}
          </Button>
        </div>

        {issues.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-background/40 p-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm">
                النتائج: <span className="font-bold text-accent">{issues.length}</span> · المحدد:{" "}
                <span className="font-bold text-accent">{selectedIssues.length}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSelected(Object.fromEntries(issues.map(issue => [issue.id, true])))
                  }
                >
                  تحديد الكل
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelected({})}>
                  إلغاء التحديد
                </Button>
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  تصدير CSV
                </Button>
                <Button size="sm" onClick={applySelected} disabled={applyMutation.isPending}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  تطبيق المحدد
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {issues.map(issue => (
                <div key={issue.id} className="rounded-xl border border-border/60 bg-background/40 p-4">
                  <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{issueKindLabel(issue.kind)}</Badge>
                        <Badge variant="outline" className={severityClass(issue.severity)}>
                          {issue.severity}
                        </Badge>
                        <span className="break-all text-xs text-muted-foreground">{issue.path}</span>
                      </div>
                      <div className="text-sm font-semibold">{issue.reason}</div>
                      <p className="text-xs text-muted-foreground">{issue.detail}</p>
                    </div>
                    <Button
                      variant={selected[issue.id] ? "default" : "outline"}
                      size="sm"
                      className="min-h-10"
                      onClick={() =>
                        setSelected(prev => ({ ...prev, [issue.id]: !prev[issue.id] }))
                      }
                    >
                      {selected[issue.id] ? "محدد" : "غير محدد"}
                    </Button>
                  </div>

                  <DiffBlocks before={issue.translation} after={edits[issue.id] ?? issue.suggestion} />
                  <div className="mt-3">
                    <label className="mb-2 block text-xs font-semibold">تعديل الاقتراح قبل التطبيق</label>
                    <Textarea
                      dir="auto"
                      className="min-h-24 text-sm leading-7"
                      value={edits[issue.id] ?? issue.suggestion}
                      onChange={e => setEdits(prev => ({ ...prev, [issue.id]: e.target.value }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {downloadUrl && (
          <div className="flex flex-col gap-3 rounded-lg border border-green-500/30 bg-green-500/5 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-green-300">
              <CheckCircle className="h-5 w-5" />
              تم تجهيز ملف بعد تطبيق مراجعات زيلدا.
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => window.open(downloadUrl, "_blank")}>
                <Download className="mr-2 h-4 w-4" />
                تنزيل
              </Button>
              <Button variant="outline" onClick={() => setDownloadUrl(null)}>
                <XCircle className="mr-2 h-4 w-4" />
                إخفاء
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
