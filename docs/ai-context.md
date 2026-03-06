# Contractor App AI Context

## AI Orientation

This application is a contractor and project management system for rental property rehabs.

Key concepts:

- **Scopes** represent estimate-level work for a property.
- **Cost Library items** are high-level estimate bundles (example: "Replace Bathroom").
- **Projects** represent real rehab jobs created from scopes.
- **Tasks** represent actual work performed during a project.
- **Recipes** define step-by-step instructions that can expand a task.
- **Materials and labor** attach to tasks.
- **Actual costs** are calculated from tasks and roll up to compare against scope estimates.

Typical lifecycle:

Scope → Project → Tasks → Materials/Labor → Actual Cost → Estimate vs Actual comparison

---

## AI Loading Instructions

When reasoning about this system:

1. Read the **AI Orientation** section first.
2. Load the linked documentation files below for full system details.
3. Treat those documents as the authoritative system architecture.

---

## System Rules

- Scopes remain simple and estimate-focused.
- Cost Library items represent high-level rehab cost bundles.
- Detailed execution work happens in project tasks.
- Recipes expand tasks into step-by-step instructions.
- Materials and labor always attach to tasks.
- Actual project costs are calculated from tasks and rolled up for estimate vs actual comparison.

---

## System Architecture

Full system overview, tech stack, database structure, permissions model, UI structure, and AI features.

🔗 https://raw.githubusercontent.com/Curlybwc/bfpdashboard/main/docs/system-architecture.md

---

## Database Schema

Complete schema reference including all tables, columns, primary keys, foreign key relationships, enums, RPC functions, triggers, and ER diagrams.

🔗 https://raw.githubusercontent.com/Curlybwc/bfpdashboard/main/docs/database-schema.md

---

## System Flows

Operational workflow documentation covering scope creation, project conversion, task expansion, materials/labor tracking, and automation flows.

🔗 https://raw.githubusercontent.com/Curlybwc/bfpdashboard/main/docs/system-flows.md

---

## Usage

AI tools should load this file first, then follow the linked documents to understand the full system architecture.
