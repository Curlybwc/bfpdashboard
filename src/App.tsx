import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
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
import AdminRehabLibrary from "./pages/AdminRehabLibrary";
import ScopeAccuracy from "./pages/ScopeAccuracy";
import ToolInventory from "./pages/ToolInventory";
import MaterialInventory from "./pages/MaterialInventory";
import Today from "./pages/Today";
import Shopping from "./pages/Shopping";
import FieldModeCapture from "./pages/FieldModeCapture";
import FieldModePreview from "./pages/FieldModePreview";
import NotFound from "./pages/NotFound";
import MobileNav from "./components/MobileNav";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (user && (location.pathname === '/login' || location.pathname === '/')) {
      navigate('/today', { replace: true });
    }
    if (!user && location.pathname !== '/login' && location.pathname !== '/') {
      navigate('/login', { replace: true });
    }
  }, [user, loading, location.pathname, navigate]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/login" element={<Login />} />
        {user && (
          <>
            <Route path="/today" element={<Today />} />
            <Route path="/today/field-mode" element={<FieldModeCapture />} />
            <Route path="/today/field-mode/preview" element={<FieldModePreview />} />
            <Route path="/projects" element={<ProjectList />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/projects/:id/materials" element={<ProjectMaterials />} />
            <Route path="/projects/:id/field-mode" element={<FieldModeCapture />} />
            <Route path="/projects/:id/field-mode/preview" element={<FieldModePreview />} />
            <Route path="/projects/:id/walkthrough" element={<ProjectWalkthrough />} />
            <Route path="/projects/:projectId/tasks/:taskId" element={<TaskDetail />} />
            <Route path="/scopes" element={<ScopeList />} />
            <Route path="/scopes/:id" element={<ScopeDetail />} />
            <Route path="/scopes/:id/walkthrough" element={<ScopeWalkthrough />} />
            <Route path="/shopping" element={<Shopping />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/admin/recipes" element={<AdminRecipes />} />
            <Route path="/admin/bundles" element={<AdminMaterialBundles />} />
            <Route path="/admin/rehab-library" element={<AdminRehabLibrary />} />
            <Route path="/admin/scope-accuracy" element={<ScopeAccuracy />} />
            <Route path="/admin/store-sections" element={<AdminStoreSections />} />
            <Route path="/admin/inventory/tools" element={<ToolInventory />} />
            <Route path="/admin/inventory/materials" element={<MaterialInventory />} />
          </>
        )}
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
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
