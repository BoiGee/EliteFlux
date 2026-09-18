export function Steps({ items, note }: { items: string[]; note?: string }) {
  return (
    <>
      <ol className="space-y-2 list-decimal list-inside">
        {items.map((s) => (
          <li key={s} className="text-xs text-muted-foreground leading-relaxed">
            {s}
          </li>
        ))}
      </ol>
      {note && <p className="text-[11px] text-muted-foreground/80 leading-relaxed pt-1">{note}</p>}
    </>
  );
}
