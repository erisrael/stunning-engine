# ADR-004: Watermelon UI Architectural Adaptation Layer

## Status
Accepted

## Context
MySeed Academy requires an institutional, modern, and accessible design system with WCAG 2.2 AA compliance. Directly hard-coding third-party UI templates leads to vendor lock-in, generic aesthetics, and brittle styling overrides.

## Decision
1. Establish a dedicated first-party component package in `packages/ui`.
2. Extract proven UX interaction patterns, card layouts, and responsive blueprints from Watermelon UI.
3. Inject the **MySeed Brand Design Tokens**:
   - Palette: Deep Emerald/Green, Warm Gold accents, Slate/Charcoal neutrals.
   - Typography: Inter/Outfit for Latin scripts, Noto Sans Ethiopic for Amharic.
   - Directionality: CSS logical properties supporting LTR and RTL (Arabic).
4. Export all components as first-party `MySeed*` primitives (`MySeedButton`, `MySeedCard`, `MySeedNavbar`, `MySeedChatPanel`, etc.).

## Consequences
- Guaranteed WCAG 2.2 AA compliance across all components.
- Complete visual differentiation and brand integrity.
- Reusable across both public website and administrative backoffice.
