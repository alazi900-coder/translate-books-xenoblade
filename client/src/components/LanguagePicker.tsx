import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUPPORTED_LANGUAGES, findLanguage } from "@/lib/languages";

interface LanguagePickerProps {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}

export function LanguagePicker({
  value,
  onChange,
  disabled,
  placeholder = "اختر اللغة...",
  ariaLabel,
}: LanguagePickerProps) {
  const [open, setOpen] = useState(false);
  const current = findLanguage(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          aria-expanded={open}
          aria-label={ariaLabel}
          className="w-full justify-between bg-card border-border/50"
        >
          <span className="truncate">
            {current
              ? `${current.name} (${current.code.toUpperCase()})`
              : placeholder}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command
          filter={(itemValue, search) => {
            const lower = search.toLowerCase();
            return itemValue.toLowerCase().includes(lower) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="ابحث عن لغة..." />
          <CommandList>
            <CommandEmpty>لا توجد نتائج.</CommandEmpty>
            <CommandGroup>
              {SUPPORTED_LANGUAGES.map(lang => {
                const searchable = `${lang.name} ${lang.englishName} ${lang.code}`;
                return (
                  <CommandItem
                    key={lang.code}
                    value={searchable}
                    onSelect={() => {
                      onChange(lang.code);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === lang.code ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="flex-1">{lang.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {lang.englishName} · {lang.code.toUpperCase()}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
