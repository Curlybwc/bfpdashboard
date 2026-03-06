# Contractor App AI Context

## AI Orientation

This application is a contractor and project management system for rental property rehabs.

Key concepts:

- **Scopes** represent estimate-level work for a property.
- **Cost Library items** are high-level estimate bundles (ex: "Replace Bathroom").
- **Projects** represent real rehab jobs created from scopes.
- **Tasks** represent actual work performed during a project.
- **Recipes** define step-by-step instructions that can expand a task.
- **Materials and labor** attach to tasks.
- **Actual costs** are calculated from tasks and roll up to compare against scope estimates.

Typical lifecycle:

Scope → Project → Tasks → Materials/Labor → Actual Cost → Estimate vs Actual comparison

---

## System Architecture

Full system overview, tech stack, database structure, permissions model, UI structure, and AI features.

🔗 [docs/system-architecture.md](https://raw.githubusercontent.com/Curlybwc/bfpdashboard/main/docs/system-architecture.md)

---

## Database Schema

Complete schema reference including all tables, columns, primary keys, foreign key relationships, enums, RPC functions, triggers, and a Mermaid ER diagram.

🔗 [docs/database-schema.md](https://raw.githubusercontent.com/Curlybwc/bfpdashboard/main/docs/database-schema.md)

---

## System Flows

Operational workflow documentation covering scope creation, project conversion, task expansion, materials/labor tracking, AI parsing, and Mermaid flow diagrams.

🔗 [docs/system-flows.md](https://raw.githubusercontent.com/Curlybwc/bfpdashboard/main/docs/system-flows.md)

---

## Usage

To feed these docs to an AI tool, provide the raw URLs above so it can fetch the latest versions directly.
