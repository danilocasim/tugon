import { FileText, HandHeart, ShieldCheck, Trash2, TrafficCone, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS, URGENCY, type Category, type Lang, type Status, type Urgency } from "@/lib/domain";

/* Status and urgency are carried by tone and text, never outlines. */

const STATUS_STYLE: Record<Status, string> = {
  received: "bg-fill text-foreground/75",
  review: "bg-normal-soft text-normal",
  needs_info: "bg-medium-soft text-medium",
  queued: "bg-fill text-foreground",
  in_progress: "bg-brand-soft text-brand-deep",
  resolved: "bg-primary text-primary-foreground",
  referred: "bg-[#efeaf6] text-[#5d4a7d]",
  duplicate: "bg-fill text-ink-3",
  withdrawn: "bg-fill text-ink-3",
};

const STATUS_DOT: Record<Status, string> = {
  received: "bg-ink-3",
  review: "bg-normal",
  needs_info: "bg-medium",
  queued: "bg-foreground/70",
  in_progress: "bg-primary",
  resolved: "bg-gold",
  referred: "bg-[#5d4a7d]",
  duplicate: "bg-ink-3/60",
  withdrawn: "bg-ink-3/60",
};

export function StatusBadge({ status, lang = "en", className }: { status: Status; lang?: Lang; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold whitespace-nowrap", STATUS_STYLE[status], className)}>
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status], status === "in_progress" && "animate-pulse")} />
      {STATUS[status][lang]}
    </span>
  );
}

/** Dot and label only, for dense lists where a filled pill would be noise. */
export function StatusText({ status, lang = "en", className }: { status: Status; lang?: Lang; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap text-foreground/80", status === "needs_info" && "text-medium", className)}>
      <span className={cn("size-[7px] rounded-full", STATUS_DOT[status], status === "in_progress" && "animate-pulse")} />
      {STATUS[status][lang]}
    </span>
  );
}

const URGENCY_STYLE: Record<Urgency, string> = {
  high: "text-high bg-high-soft",
  medium: "text-medium bg-medium-soft",
  normal: "text-normal bg-normal-soft",
};

const URGENCY_TEXT: Record<Urgency, string> = { high: "text-high", medium: "text-medium", normal: "text-normal" };

const URGENCY_BARS: Record<Urgency, number> = { high: 3, medium: 2, normal: 1 };

function Bars({ urgency }: { urgency: Urgency }) {
  return (
    <span className="flex items-end gap-[2px]" aria-hidden>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn("w-[3px] rounded-[1px] bg-current", i <= URGENCY_BARS[urgency] ? "opacity-100" : "opacity-25")} style={{ height: 4 + i * 2.5 }} />
      ))}
    </span>
  );
}

/** Urgency reads by bar count and label, never by color alone. A model suggestion drops the fill so it reads as unconfirmed. */
export function UrgencyTag({ urgency, lang = "en", suggested, className }: { urgency: Urgency; lang?: Lang; suggested?: boolean; className?: string }) {
  return (
    <span
      title={suggested ? "Model suggestion" : undefined}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold whitespace-nowrap",
        suggested ? `${URGENCY_TEXT[urgency]} px-0` : URGENCY_STYLE[urgency],
        className,
      )}
    >
      <Bars urgency={urgency} />
      {URGENCY[urgency][lang]}
      {suggested && <span className="sr-only">(suggested)</span>}
    </span>
  );
}

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  peace: ShieldCheck,
  infra: TrafficCone,
  sanitation: Trash2,
  documents: FileText,
  social: HandHeart,
};

const CATEGORY_TINT: Record<Category, string> = {
  peace: "bg-[#e6ecf5] text-[#33507a]",
  infra: "bg-[#faecd8] text-[#8a5200]",
  sanitation: "bg-[#dff0e7] text-[#0b5d4b]",
  documents: "bg-[#ece9f4] text-[#544a72]",
  social: "bg-[#fae6e2] text-[#a1402c]",
};

export function CategoryIcon({ category, size = "md", className }: { category: Category; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const Icon = CATEGORY_ICON[category];
  const box = { sm: "size-7 rounded-[9px]", md: "size-10 rounded-[13px]", lg: "size-12 rounded-[15px]", xl: "size-14 rounded-[18px]" }[size];
  const icon = { sm: "size-3.5", md: "size-5", lg: "size-6", xl: "size-[26px]" }[size];
  return (
    <span className={cn("inline-grid shrink-0 place-items-center", box, CATEGORY_TINT[category], className)} aria-hidden>
      <Icon className={icon} strokeWidth={1.9} />
    </span>
  );
}
