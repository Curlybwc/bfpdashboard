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
