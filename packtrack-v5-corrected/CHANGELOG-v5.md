# PackTrack — v5 corrections (against "Latest editing for packtrack 1")

## Round 5 — UI/UX pass (accessibility + consistency)

Acting on the design audit, Priority 1 (accessibility) and Priority 2 (consistency):

Accessibility
- **Global keyboard focus ring** (`index.css`): a `:where(...):focus-visible` outline in
  the accent color, `!important` so it shows through `outline-none` utilities, applied
  app-wide without touching every control. Pointer clicks stay ring-free.
- **Contrast**: `--color-text-dim` lifted #4a5568 → #6f7b90 (≈2.4:1 → ≈4.3:1 on surface),
  fixing the smallest mono labels/timestamps that previously failed WCAG.
- **Dialog semantics**: ReviewModal, DetailModal, and the new confirm dialog carry
  `role="dialog"` + `aria-modal` + `aria-label`; icon-only controls (modal ✕, notification
  bell) now have accessible names; the bell exposes `aria-expanded`/`aria-haspopup`.
- **Escape + backdrop close**: both modals close on Escape (ReviewModal ignores Escape while
  typing); DetailModal also closes on backdrop click (inner clicks are guarded).
- **Native `window.confirm` removed** (`AdminPanel`): department- and template-delete now use
  a themed, accessible confirm dialog.

Consistency
- **Icon system unified**: the sidebar's Unicode glyphs (◈ ⊕ ◎ …) replaced with `lucide-react`
  icons (already the app's icon set elsewhere); nav marks the active item with `aria-current`.
- **Terminology**: remaining "Rework" copy (Dashboard metric, ReviewQueue) unified to "Correction".
- **Primary-button color**: the two `bg-accent text-white` buttons in AdminPanel (a regression
  from Round 3) corrected to the house `text-black` on amber.
- **Shared `WorkflowStepper`**: the stepper markup duplicated in ReviewModal and DetailModal is
  now one component (`size="md"`/`"sm"`), removing drift.

QC: `tsc --noEmit` 0 errors; `vite build` 1691 modules ✓; server bundle ✓.

Deferred to a later pass (noted in the audit): toast dismissibility/animation, DetailModal
loading skeleton, radius-scale sweep, and the Dashboard/Review-Queue IA overlap.

---



### Annotation baking into the archived PDF — `server/bake.ts` (new), `server.ts`
- On final archiving the annotation ledger is now **permanently flattened into the
  PDF** with `pdf-lib`. `bakeAnnotations()` mirrors the on-screen renderer's
  normalized coordinate model exactly (top-left origin → PDF bottom-left flip) and
  draws highlights, circles, measures (line + endpoints + length label), comments,
  symbols, and the professional signature block directly into page content.
- Exotic symbol glyphs (✓ ∑ √ → ≈ …) that the standard PDF fonts cannot encode are
  mapped to safe equivalents, and every text draw is wrapped so an unencodable glyph
  can never crash archiving. Unparseable source PDFs fall back to a standalone
  annotated sheet so a valid annotated PDF is always produced.
- `makeArtworkPdf()` generates a valid raw PDF for seed submissions that have no
  stored bytes, guaranteeing baking always has a loadable source.

### Raw + annotated stored on the same submission, downloaded separately
- Final archiving stores **both** the raw (plain) artwork and the flattened
  annotated copy on the same submission (`rawFileId/rawLink`, `annotatedFileId/annotatedLink`;
  `approvedFileId` retained for back-compat, pointing at the annotated copy).
- `DetailModal` now offers **two separate downloads** — *Raw PDF (plain)* and
  *Annotated PDF (flattened)* — gated to IB-CO/IB-SH/QC-SH. The in-modal viewer
  loads the raw PDF with the live overlay (so it isn't double-drawn against the baked copy).

### Per-submission Drive folders (named by ID) — `server/drive.ts`
- New `archiveSubmissionFolder(id, files)` creates a folder per submission (named by
  its ID) holding the raw + annotated PDFs with a `_folder.json` manifest; in
  real-Drive mode this maps to a Drive folder (files.create folder → upload with
  parents). `getArchivedFileRecord` now resolves files inside these folders too.

### Buyer confirmation attachments (Commercial) — `DetailModal.tsx`, `server.ts`
- IB-CO can attach buyer-confirmation e-mail screenshots (jpg/png) to a **Commercial**
  artwork from the detail view; thumbnails are visualized for everyone and the event
  is written to the audit trail. Confirmations are included in the archived dossier meta.

### QC performed this round
- `tsc --noEmit`: **0 errors** across client + server.
- `vite build`: **1690 modules transformed ✓**; server esbuild bundle ✓.
- Unit test `scripts/bake_test.ts`: all annotation types incl. exotic symbols, multipage,
  out-of-range page clamping, legacy coords, empty/garbage inputs → valid PDFs ✓.
- Functional test `scripts/drive_test.ts`: per-submission folder creation, manifest,
  and by-fileId retrieval ✓.

### Next cycle
- UI/UX review of the whole app (as requested) — inconsistencies & improvements.
- Caveat: annotation baking targets pages with default rotation (0°); rotated source
  pages would need rotation-aware transforms.

---

## Round 1–3 (earlier)


This build applies the corrections that are **client-side, self-contained, and
verifiable**, concentrated on the areas the requirements doc specifies most
heavily (the review/annotation experience). Server-coupled items are listed at
the bottom with precise implementation direction — they were intentionally
**not** half-implemented to avoid destabilising a working GxP-oriented system.

All changed files pass the project's own esbuild transform (the Vite build path).

## Implemented in this build

### Review & annotation core — `PdfCanvasViewer.tsx`, `ReviewModal.tsx`, `types.ts`, `index.css`
- **Full-screen review popup.** The review modal now fills the viewport
  (`fixed inset-0`, header pinned, body scrolls, action bar pinned) instead of a
  centred `max-w-6xl` card. (Doc §Review artwork.)
- **Professional digital signature.** Signatures render as a certificate block:
  the signer's name in a script face (`Dancing Script`), a rule, and
  `Digitally signed · <role>` with a captured local timestamp. New
  `signedName / signedRole / signedDate` fields on `Annotation`. (Doc §Review.)
- **Signature can be applied only once per user**, enforced at the single
  annotation write path (`addAnnotation`).
- **Cannot forward/approve before signing.** Member "Forward to Head" and Head
  "Approve & Release" are disabled and guarded until the acting user has signed;
  correction (send-back) does not require a signature. A live
  "Signed / Signature required" chip sits in the toolbar. (Doc §Review, §General.)
- **Signatures are immutable.** The eraser and "undo" both skip `signature`
  annotations, so no one can remove or alter a signature. (Doc §General, §Review.)
- **Symbol marking tool.** New tool + glyph palette (`/ * ^ ° ± × ÷ √ ∑ µ …`)
  plus a free-text custom glyph, stamped onto the artwork as `symbol`
  annotations. (Doc §Review: "another tool for adding symbols".)
- **Illustrator-style measurement guides.** Top & left rulers with ticks in the
  active unit (mm/cm/in/pt, calibration-aware); drag from a ruler to drop a
  horizontal/vertical guide; guides are draggable and individually deletable;
  measurement endpoints snap to guides. (Doc §Review: "guides similar to
  illustrator".)
- **More functional/elegant zoom.** Ctrl/⌘ + wheel zoom anchored to the cursor,
  Fit-to-width, 1:1, finer steps, 40–400%. (Doc §Review.)

### All Submissions — `Tracker.tsx`
- Ordered **most-recent first**; selectable page size **50 / 100 / 200**; generated,
  windowed page buttons; auto-updates via the existing 3 s poll. (Doc §All submissions.)

### Archive — `Archive.tsx`
- **Recent additions on top, oldest at the bottom**; same 50/100/200 page-size +
  page-button pagination. (Doc §Archive — ordering & pagination.)

### IB-CO Dashboard — `Dashboard.tsx`
- New **"Recently Approved Artworks"** panel (IB-CO only), newest first, each card
  showing product/country/plant/purpose, signature count, and age. (Doc §IB-CO.)

### Archive metadata completeness — `DetailModal.tsx`, `server.ts`
- **All submission-form metadata now travels with the archived record.** The
  archive's detail view (opened from the Archive / All-Submissions tables) gained
  a "Regulatory & Submission Metadata" panel rendering every field captured at
  intake: generic name, strength, composition, DAR/registration no., material
  code, barcode no., pack size, storage condition, market countries, manufacturer,
  components, artwork date, submitter (name · role), submitted-on timestamp, and
  the submitter's comments/instructions. Empty fields render as "—".
  Previously only product/country/dosage/plant/purpose/priority were shown.
- **The physical Drive archive record embeds the full dossier** too: the `meta`
  written by `archiveArtwork` on final approval was expanded from
  product/country/plant to the complete field set above (plus approval + audit
  context), so the archived artifact is self-describing. (Doc §Archive; new
  requirement: all uploaded metadata present in the archive with the submission.)

### Types — `types.ts`
- `Annotation.type` gains `'symbol'`; signature metadata added.
- Fixed a latent reference: `Submission.extractedText` is now declared (it was
  read by `ReviewModal`/`DetailModal` but missing from the interface).
- Added a typed `BuyerConfirmation` slot + `Submission.buyerConfirmations` to
  receive the commercial buyer-confirmation screenshots (wiring is server work).

## Remaining — directed work (server-coupled or needs deeper review)
These are specified in the accompanying analysis and are the next cycle:
1. **Head override of a member's correction** (§General). Requires a server
   transition change: a member "correction" should route to the Head
   (`HEAD_FINAL`) carrying a `memberFlaggedCorrection` flag, giving the Head two
   actions — *Forward correction to IB-CO* or *Override & continue* — rather than
   the current straight-to-IB-CO reset in `server.ts` (the `correction` action).
2. **Buyer-confirmation JPG attachment** for commercial artworks (§Full platform
   logic). Type slot is in place; add an upload control in the review/detail
   views, an `attach_buyer_confirmation` server action, audit-trail surfacing,
   and inclusion in the Drive archive payload.
3. **Archive storage policy** (§Archive). On approval, store *both* the
   unannotated and annotated PDFs; on correction, store *only* the remarks +
   correction-annotated PDF (not the artwork). Implement in `server.ts`
   approve/correction handlers + `server/drive.ts`.
4. **Audit trail: inline annotation PDF + plant filter** (§Audit Trail).
   `AuditTrail.tsx` already builds an annotation manifest for export; add a
   plant-wise filter control and an inline annotated-PDF viewer per submission.
5. **Admin panel role-scoping + template edit** (§Workflow template builder).
   Hide Department & Access Controls / Performance-Metrics-&-Queue for IB-SH;
   make each workflow template editable (not just deletable); add
   per-department "artworks stored" analytics alongside the existing metrics.
6. **Downloadable artworks for IB-CO / IB-SH / QC-SH** (§Full platform logic) and
   **workflow editable in the member's review** (§IB-SH) — both need server
   endpoints/permissions; the review artwork itself stays non-downloadable.
7. **Seed artwork mockups → real PDFs** (§Seed artwork). Convert the seed
   specimens to actual PDFs served by `/api/drive/file/:id`.
