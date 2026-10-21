# Architecture rules

- Agent API additions use server-only, service-role-granted transactional functions for financial locks, duplicate protection, and multi-record writes; existing API actions retain their contracts.
- Workers remain auth-backed profiles; API creation must not fabricate identities or provision accounts without an explicit onboarding contract.
- API monetary inputs and dates are validated before resolution; dashboard shifts remain the single source of payroll obligations.
- Edge runtime imports stay outside pure validation modules so browser test/typechecking does not traverse server-only dependencies.