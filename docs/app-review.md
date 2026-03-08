# App Review (Plain-English)

This note summarizes what this app appears to do and improvement opportunities.

## What this app does

- It is a mobile-first contractor operations app for rehab projects.
- It handles scoping/estimation, conversion to projects, task management, materials, shifts/availability, and inventory.
- It uses AI-assisted parsing for walkthrough and field-mode text capture.

## Top issues worth fixing first

1. Reliability:
   - Add stronger error handling and retry/fallback UX for critical reads (permissions, dashboard loading, project loading).
2. Maintainability:
   - Reduce use of `any` and split large page components into focused hooks/components.
3. Security/privacy:
   - Revisit public photo storage if photos may contain sensitive homeowner/property information.
4. Onboarding/documentation:
   - Replace Lovable placeholder URLs and add a real project README with setup and product explanation.

## Product/UX opportunities

- Add clearer “what should I do now?” workflow for each role (contractor, manager, admin).
- Add guided first-run onboarding and empty-state examples.
- Add confidence indicators + quick edit affordances on AI-parsed results.
- Improve navigation discoverability for advanced areas (recipes, bundles, assignment rules).
