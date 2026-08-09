import logoUrl from "@/assets/eliteflux-logo.png";

const MARK_SIZES = {
  xs: "w-10 h-10",
  sm: "w-12 h-12",
  md: "w-14 h-14",
  lg: "w-16 h-16",
  xl: "w-20 h-20",
} as const;

const TEXT_SIZES = {
  xs: "text-base",
  sm: "text-lg",
  md: "text-xl",
  lg: "text-2xl",
  xl: "text-3xl",
} as const;

export type BrandSize = keyof typeof MARK_SIZES;

export function BrandMark({
  size = "md",
  className = "",
  priority = false,
}: {
  size?: BrandSize;
  className?: string;
  priority?: boolean;
}) {
  return (
    <img
      src={logoUrl}
      alt="EliteFlux"
      width={512}
      height={512}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={`${MARK_SIZES[size]} object-contain shrink-0 ${className}`}
    />
  );
}

export function BrandLockup({
  size = "md",
  tagline,
  className = "",
  priority = false,
}: {
  size?: BrandSize;
  tagline?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <BrandMark size={size} priority={priority} />
      <span className="flex flex-col leading-none min-w-0">
        <span className={`font-extrabold tracking-tight text-white ${TEXT_SIZES[size]}`}>
          Elite<span className="text-gradient">Flux</span>
        </span>
        {tagline ? (
          <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
            {tagline}
          </span>
        ) : null}
      </span>
    </span>
  );
}
