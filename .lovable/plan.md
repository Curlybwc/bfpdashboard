

## Fix: Build Errors Causing Blank Screen

Two syntax errors are breaking the build:

### 1. `src/components/TaskCard.tsx` (line 284)
The ternary expression (lines 258-284) is inside JSX but missing its closing `}`. Line 284 has `)` but needs `)}` to close the JSX expression block.

**Fix**: Change line 284 from `)` to `)}`.

### 2. `src/pages/ProjectDetail.tsx` (line 468)
There's a stray extra `)}` on line 468. The `{newDueDate && (...)}` block already closes properly at line 467. Line 468 is a duplicate that breaks the JSX parser.

**Fix**: Remove line 468 (`)}` — the extra one).

Both are single-character fixes that will restore the build immediately.

