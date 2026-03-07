

## Plan: Refactor Admin Panel Nav to Grouped Menus (Desktop Menubar + Mobile Sheet)

### Single file changed: `src/pages/AdminPanel.tsx`

### What's removed
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` — all removed entirely

### What's added

**Imports:**
- `Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem` from `@/components/ui/menubar`
- `Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle` from `@/components/ui/sheet`
- `Button` from `@/components/ui/button`
- `useIsMobile` from `@/hooks/use-mobile`
- `Menu` icon from `lucide-react`

**State:**
```typescript
const [activeView, setActiveView] = useState<'users' | 'cost-library' | 'aliases'>('users');
const [sheetOpen, setSheetOpen] = useState(false);
const isMobile = useIsMobile();
```

**Menu structure** (shared data, used by both desktop and mobile):

| Group | Item | Action |
|-------|------|--------|
| Libraries | Cost Library | `setActiveView('cost-library')` |
| | Recipes | `navigate('/admin/recipes')` |
| | Rehab Library | `navigate('/admin/rehab-library')` |
| | Bundles | `navigate('/admin/bundles')` |
| | Store Sections | `navigate('/admin/store-sections')` |
| Operations | Shifts | `navigate('/shifts')` |
| Inventory | Tools | `navigate('/admin/inventory/tools')` |
| | Materials | `navigate('/admin/inventory/materials')` |
| Reports | Scope Accuracy | `navigate('/admin/scope-accuracy')` |
| Access | Users | `setActiveView('users')` |
| | Aliases | `setActiveView('aliases')` |

**Desktop (md+):** Render a `Menubar` with 5 `MenubarMenu` groups. Each `MenubarItem` calls navigate or setActiveView.

**Mobile (<md):** Render a `Button` labeled "Admin Menu" with a `Menu` icon. Opens a `Sheet` (side="top" or "left"). Inside the sheet, render the 5 groups as labeled sections with tappable buttons/items.

**Active view label:** Below the menu bar, show `<p className="text-xs text-muted-foreground">Viewing: Users</p>` (mapped from activeView).

**Content rendering:** Simple conditional:
```tsx
{activeView === 'users' && ( /* existing user management JSX */ )}
{activeView === 'cost-library' && <CostLibrary />}
{activeView === 'aliases' && <AdminAliases />}
```

### What stays the same
- Admin gating logic (useAdmin redirect)
- Profile fetching, toggleAdmin, toggleField functions
- All user management card rendering
- CostLibrary and AdminAliases components
- All route destinations
- No new routes, no DB changes

