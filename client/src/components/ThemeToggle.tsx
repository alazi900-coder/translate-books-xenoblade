import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  if (!toggleTheme) return null;
  const isDark = theme === "dark";
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      aria-label={isDark ? "تبديل إلى الوضع الفاتح" : "تبديل إلى الوضع الداكن"}
      title={isDark ? "الوضع الفاتح" : "الوضع الداكن"}
      className="border-border/50"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}
