# Mobile responsiveness: navigation and layout gaps

## The core problem

The module sidebar is desktop-only (`hidden lg:flex`). On phones and small tablets there is no replacement, so the 16 intelligence modules (Recommendations, Exit Intelligence, Brain AI v3, Smart Money, Heatmap, etc.) are completely unreachable — mobile users are stuck on whatever module loads by default. The Coach, Portfolio and Autopilot links live in the same hidden sidebar, and in the top bar they are also hidden below `sm`/`md`.

## What to build

### 1. Mobile navigation drawer
- Add a hamburger button in the top bar, visible only below `lg`, that opens a slide-in drawer (shadcn `Sheet`) containing the full module list plus AI Coach / Portfolio / Autopilot links and the tier lock badges.
- Reuse the existing nav item data so desktop and mobile never drift apart: extract the shared list/rendering out of `Sidebar.tsx` and use it in both surfaces.
- Selecting a module closes the drawer and switches the active view. Active module is highlighted.

### 2. Top bar on small screens
- Show the EliteFlux logo on mobile (currently `hidden lg:flex`, so mobile has no branding or home link).
- Collapse the search field into an icon-triggered input below `md` so the action row stops competing for width.
- Keep Coach/Portfolio reachable on mobile via the drawer rather than crowding the header.
- Apply the grid + `min-w-0` + `shrink-0` header pattern so nothing clips at 360px.

### 3. Coach workspace on mobile
`CoachWorkspace` is a 3-column grid that stacks into a very long page on mobile: conversation list, then chat, then briefing/journal. Rework to a mobile layout where the chat is the primary surface, with the conversation list and the journal/profile panels behind compact collapsible sections or a tab strip above the chat.

### 4. Page-level pass
- Portfolio and Admin tables: keep `overflow-x-auto` but add a min-width to the table so columns don't crush, and ensure the connect wizard dialog fits small viewports.
- Autopilot autonomy dial, guardrail inputs, and action inbox rows: verify tap targets and stacking below `sm`.
- Landing page hero and nav: verify buttons wrap rather than overflow.
- Dashboard header row and the trading-conditions banner: verify text truncates instead of pushing layout.

### 5. Verification
Drive the app at 390x844 and 768x1024 with a browser script and capture screenshots of the dashboard, coach, portfolio and autopilot to confirm no horizontal scroll and no clipped controls.

## Technical notes

- New `src/components/eliteflux/MobileNav.tsx` using `@/components/ui/sheet`; nav item data stays exported from `Sidebar.tsx`.
- `TopBar` gains an optional `onOpenNav` prop; `src/routes/index.tsx` passes the active module state down so drawer and sidebar share one source of truth.
- Pure presentation changes — no backend, engine, or data-fetch logic touched.
