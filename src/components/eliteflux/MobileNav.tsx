import { useState } from "react";
import { Menu } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BrandMark } from "./BrandLogo";
import { AppShortcutLinks, ModuleNavList, type ModuleKey } from "./Sidebar";

export function MobileNav({
  active,
  onSelect,
}: {
  active?: ModuleKey;
  onSelect?: (key: ModuleKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const select = (key: ModuleKey) => {
    setOpen(false);
    if (onSelect) onSelect(key);
    else navigate({ to: "/", search: { m: key } });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label="Open menu"
          className="lg:hidden w-9 h-9 shrink-0 grid place-items-center rounded-lg glass-panel hover:border-primary/40 transition"
        >
          <Menu className="w-4.5 h-4.5" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[86vw] max-w-[300px] p-0 bg-background/95 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 h-16 border-b border-border/50">
          <BrandMark size="md" priority />
          <SheetTitle className="flex flex-col leading-none text-left">
            <span className="font-extrabold text-lg tracking-tight text-white">
              Elite<span className="text-gradient">Flux</span>
            </span>
            <span className="text-[10px] text-foreground/60 uppercase tracking-[0.18em] font-medium">
              Market Intelligence
            </span>
          </SheetTitle>
        </div>

        <div className="h-[calc(100dvh-4rem)] overflow-y-auto p-3 space-y-1.5">
          <ModuleNavList active={active} onSelect={select} />
          <div className="pt-3 mt-2 border-t border-border/50 space-y-1">
            <p className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
              Workspace
            </p>
            <AppShortcutLinks onNavigate={() => setOpen(false)} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
