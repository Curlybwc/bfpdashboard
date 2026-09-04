import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { OrgProvider } from "@/hooks/useOrg";
import { useGlobalPermissions } from "@/hooks/useAdmin";
import { useEffect, ReactNode, lazy, Suspense } from "react";
import Index from "./pages/Index";
import Login from "./pages/Login";
const ProjectList = lazy(() => import("./pages/ProjectList"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const ProjectMaterials = lazy(() => import("./pages/ProjectMaterials"));
const ProjectWalkthrough = lazy(() => import("./pages/ProjectWalkthrough"));
const TaskDetail = lazy(() => import("./pages/TaskDetail"));
const ScopeList = lazy(() => import("./pages/ScopeList"));
const ScopeDetail = lazy(() => import("./pages/ScopeDetail"));
const ScopeWalkthrough = lazy(() => import("./pages/ScopeWalkthrough"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const AdminStoreSections = lazy(() => import("./pages/AdminStoreSections"));
const AdminRecipes = lazy(() => import("./pages/AdminRecipes"));
const AdminMaterialBundles = lazy(() => import("./pages/AdminMaterialBundles"));
const AdminAssignmentRules = lazy(() => import("./pages/AdminAssignmentRules"));
const AdminRehabLibrary = lazy(() => import("./pages/AdminRehabLibrary"));
const ScopeAccuracy = lazy(() => import("./pages/ScopeAccuracy"));
const ToolInventory = lazy(() => import("./pages/ToolInventory"));
const MaterialInventory = lazy(() => import("./pages/MaterialInventory"));
const ProductLibrary = lazy(() => import("./pages/ProductLibrary"));
import Today from "./pages/Today";
const Shopping = lazy(() => import("./pages/Shopping"));
const Shifts = lazy(() => import("./pages/Shifts"));
const Payroll = lazy(() => import("./pages/Payroll"));
const Availability = lazy(() => import("./pages/Availability"));
const FieldModeCapture = lazy(() => import("./pages/FieldModeCapture"));
const FieldModePreview = lazy(() => import("./pages/FieldModePreview"));
import NotFound from "./pages/NotFound";
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Eula = lazy(() => import("./pages/Eula"));
const QBDisconnected = lazy(() => import("./pages/QBDisconnected"));
const Analytics = lazy(() => import("./pages/Analytics"));
const CalendarView = lazy(() => import("./pages/CalendarView"));
const Accounting = lazy(() => import("./pages/Accounting"));
const AdminVendorMappings = lazy(() => import("./pages/AdminVendorMappings"));
const AdminVendors = lazy(() => import("./pages/AdminVendors"));
const AdminActivityLog = lazy(() => import("./pages/AdminActivityLog"));
const AdminBulkCandidates = lazy(() => import("./pages/AdminBulkCandidates"));
const AdminInvites = lazy(() => import("./pages/AdminInvites"));
const AdminStrandedUsers = lazy(() => import("./pages/AdminStrandedUsers"));
const Reimbursements = lazy(() => import("./pages/Reimbursements"));
const AdminReimbursements = lazy(() => import("./pages/AdminReimbursements"));
const AdminReimbursementPaymentQueue = lazy(() => import("./pages/AdminReimbursementPaymentQueue"));
import MobileNav from "./components/MobileNav";
import ImpersonationBanner from "./components/ImpersonationBanner";
import GlobalClockBanner from "./components/shifts/GlobalClockBanner";
import OfflineIndicator from "./components/OfflineIndicator";

const queryClient = new QueryClient();

/** Redirects contractors away from manager/admin-only routes — uses GLOBAL flags */
const ManagerGuard = ({ children }: { children: ReactNode }) => {
  const { isAdmin, canManageProjects, loading } = useGlobalPermissions();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  if (!isAdmin && !canManageProjects) return <Navigate to="/today" replace />;
  return <>{children}</>;
};

/** Redirects non-admins away from admin-only routes — uses GLOBAL flags */
const AdminGuard = ({ children }: { children: ReactNode }) => {
  const { isAdmin, loading } = useGlobalPermissions();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  if (!isAdmin) return <Navigate to="/today" replace />;
  return <>{children}</>;
};

const AppRoutes = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (user && (location.pathname === '/login' || location.pathname === '/')) {
      navigate('/today', { replace: true });
    }
    const publicRoutes = ['/login', '/', '/reset-password', '/privacy', '/eula', '/qb-disconnected'];
    if (!user && !publicRoutes.includes(location.pathname)) {
      navigate('/login', { replace: true });
    }
  }, [user, loading, location.pathname, navigate]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  }

  return (
    <>
      <OfflineIndicator />
      <ImpersonationBanner />
      {user && <GlobalClockBanner />}
      <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">Loading…</div>}>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/eula" element={<Eula />} />
        <Route path="/qb-disconnected" element={<QBDisconnected />} />
        <Route path="/today" element={<Today />} />
        <Route path="/today/field-mode" element={<ManagerGuard><FieldModeCapture /></ManagerGuard>} />
        <Route path="/today/field-mode/preview" element={<ManagerGuard><FieldModePreview /></ManagerGuard>} />
        <Route path="/projects" element={<ProjectList />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/projects/:id/materials" element={<ProjectMaterials />} />
        <Route path="/projects/:id/field-mode" element={<ManagerGuard><FieldModeCapture /></ManagerGuard>} />
        <Route path="/projects/:id/field-mode/preview" element={<ManagerGuard><FieldModePreview /></ManagerGuard>} />
        <Route path="/projects/:id/walkthrough" element={<ManagerGuard><ProjectWalkthrough /></ManagerGuard>} />
        <Route path="/projects/:projectId/tasks/:taskId" element={<TaskDetail />} />
        <Route path="/scopes" element={<ManagerGuard><ScopeList /></ManagerGuard>} />
        <Route path="/scopes/:id" element={<ManagerGuard><ScopeDetail /></ManagerGuard>} />
        <Route path="/scopes/:id/walkthrough" element={<ManagerGuard><ScopeWalkthrough /></ManagerGuard>} />
        <Route path="/shopping" element={<Shopping />} />
        <Route path="/products" element={<ProductLibrary />} />
        <Route path="/shifts" element={<Shifts />} />
        <Route path="/payroll" element={<AdminGuard><Payroll /></AdminGuard>} />
        <Route path="/availability" element={<Availability />} />
        <Route path="/admin" element={<AdminGuard><AdminPanel /></AdminGuard>} />
        <Route path="/admin/recipes" element={<AdminGuard><AdminRecipes /></AdminGuard>} />
        <Route path="/admin/bundles" element={<AdminGuard><AdminMaterialBundles /></AdminGuard>} />
        <Route path="/admin/assignment-rules" element={<AdminGuard><AdminAssignmentRules /></AdminGuard>} />
        <Route path="/admin/rehab-library" element={<AdminGuard><AdminRehabLibrary /></AdminGuard>} />
        <Route path="/admin/scope-accuracy" element={<AdminGuard><ScopeAccuracy /></AdminGuard>} />
        <Route path="/admin/store-sections" element={<AdminGuard><AdminStoreSections /></AdminGuard>} />
        <Route path="/admin/inventory/tools" element={<AdminGuard><ToolInventory /></AdminGuard>} />
        <Route path="/admin/inventory/materials" element={<AdminGuard><MaterialInventory /></AdminGuard>} />
        <Route path="/admin/analytics" element={<AdminGuard><Analytics /></AdminGuard>} />
        <Route path="/admin/calendar" element={<AdminGuard><CalendarView /></AdminGuard>} />
        <Route path="/admin/accounting" element={<AdminGuard><Accounting /></AdminGuard>} />
        <Route path="/admin/vendor-mappings" element={<AdminGuard><AdminVendorMappings /></AdminGuard>} />
        <Route path="/admin/vendors" element={<AdminGuard><AdminVendors /></AdminGuard>} />
        <Route path="/admin/activity" element={<AdminGuard><AdminActivityLog /></AdminGuard>} />
        <Route path="/admin/bulk-candidates" element={<AdminGuard><AdminBulkCandidates /></AdminGuard>} />
        <Route path="/admin/invites" element={<AdminGuard><AdminInvites /></AdminGuard>} />
        <Route path="/admin/stranded-users" element={<AdminGuard><AdminStrandedUsers /></AdminGuard>} />
        <Route path="/reimbursements" element={<Reimbursements />} />
        <Route path="/admin/reimbursements" element={<AdminGuard><AdminReimbursements /></AdminGuard>} />
        <Route path="/admin/reimbursements/payment-queue" element={<AdminGuard><AdminReimbursementPaymentQueue /></AdminGuard>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
      {user && <MobileNav />}
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <OrgProvider>
            <AppRoutes />
          </OrgProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
