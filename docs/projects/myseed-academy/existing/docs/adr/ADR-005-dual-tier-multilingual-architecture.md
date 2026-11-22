# ADR-005: Dual-Tier Multilingual Architecture

## Status
Accepted

## Context
MySeed Academy operates in Ethiopia and globally. It requires native-level editorial fidelity in English and Amharic, while expanding international reach to Spanish, French, Arabic, Mandarin Chinese, Hindi, Portuguese, and Russian without manual translation bottlenecks.

## Decision
1. **Tier 1 (Bilingual Native Core):**
   - English (`en`) and Amharic (`am`).
   - In CMS, all content models require explicit, mandatory input fields for both languages.
2. **Tier 2 (7 Automated Global Languages):**
   - Spanish (`es`), French (`fr`), Arabic (`ar` RTL), Mandarin Chinese (`zh`), Hindi (`hi`), Portuguese (`pt`), Russian (`ru`).
   - Automatically translated from English canonical text via a background translation provider pipeline (`TranslationProvider`).
   - Stored in `content_translations` table with `is_machine_translated = TRUE`.
   - Admin console provides live preview and manual override editing.
3. **Frontend Fallback Pipeline:**
   - Requested locale → Stored translation → English Canonical.
4. **Layout Directionality:**
   - Arabic automatically triggers `dir="rtl"` with mirrored icons and flex/grid direction.

## Consequences
- 100% editorial control over core Ethiopian and international English content.
- Instant availability across 9 languages for global visitors.
- Zero layout breakage across RTL and Ethiopic typographic scales.
