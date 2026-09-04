import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { OrgProvider } from "@/hooks/useOrg";
import { useGlobalPermissions } from "@/hooks/useAdmin";
import { useEffect, ReactNode } from "react";
import Index from "./pages/Index";
import Login from "./pages/Login";
import ProjectList from "./pages/ProjectList";
import ProjectDetail from "./pages/ProjectDetail";
import ProjectMaterials from "./pages/ProjectMaterials";
import ProjectWalkthrough from "./pages/ProjectWalkthrough";
import TaskDetail from "./pages/TaskDetail";
import ScopeList from "./pages/ScopeList";
import ScopeDetail from "./pages/ScopeDetail";
import ScopeWalkthrough from "./pages/ScopeWalkthrough";
import AdminPanel from "./pages/AdminPanel";
import AdminStoreSections from "./pages/AdminStoreSections";
import AdminRecipes from "./pages/AdminRecipes";
import AdminMaterialBundles from "./pages/AdminMaterialBundles";
import AdminAssignmentRules from "./pages/AdminAssignmentRules";
import AdminRehabLibrary from "./pages/AdminRehabLibrary";
import ScopeAccuracy from "./pages/ScopeAccuracy";
import ToolInventory from "./pages/ToolInventory";
import MaterialInventory from "./pages/MaterialInventory";
import ProductLibrary from "./pages/ProductLibrary";
import Today from "./pages/Today";
import Shopping from "./pages/Shopping";
import Shifts from "./pages/Shifts";
import Payroll from "./pages/Payroll";
import Availability from "./pages/Availability";
import FieldModeCapture from "./pages/FieldModeCapture";
import FieldModePreview from "./pages/FieldModePreview";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Eula from "./pages/Eula";
import QBDisconnected from "./pages/QBDisconnected";
import Analytics from "./pages/Analytics";
import CalendarView from "./pages/CalendarView";
import Accounting from "./pages/Accounting";
import AdminVendorMappings from "./pages/AdminVendorMappings";
import AdminVendors from "./pages/AdminVendors";
import AdminActivityLog from "./pages/AdminActivityLog";
import AdminBulkCandidates from "./pages/AdminBulkCandidates";
import AdminInvites from "./pages/AdminInvites";
import AdminStrandedUsers from "./pages/AdminStrandedUsers";
import Reimbursements from "./pages/Reimbursements";
import AdminReimbursements from "./pages/AdminReimbursements";
import AdminReimbursementPaymentQueue from "./pages/AdminReimbursementPaymentQueue";
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
