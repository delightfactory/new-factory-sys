
import { createBrowserRouter, RouterProvider, Routes, Route, Navigate } from "react-router-dom";
import { lazy } from 'react';
import { PageLoadBoundary } from './components/routing/PageLoadBoundary';
import { ActorQueryBoundary } from './components/auth/ActorQueryBoundary';
import { Toaster } from "sonner";

import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./components/theme-provider";
import Login from "./pages/auth/Login";
import ProtectedLayout from "./components/ProtectedLayout";
import { FactoryOAuthConsent } from "./pages/auth/FactoryOAuthConsent";
import { supabase } from "./integrations/supabase/client";

const Dashboard = lazy(() => import('./pages/Dashboard'));
const InventoryRoutes = lazy(() => import('./pages/inventory'));
const ProductionRoutes = lazy(() => import('./pages/production'));
const PackagingRoutes = lazy(() => import('./pages/packaging'));
const CommercialRoutes = lazy(() => import('./pages/commercial'));
const FinancialRoutes = lazy(() => import('./pages/financial'));
const ReportsRoutes = lazy(() => import('./pages/reports'));
const SettingsRoutes = lazy(() => import('./pages/settings'));

function ApplicationRoutes() { return (            <Routes>
              <Route path="/login" element={<Login />} />

              <Route path="/" element={<ProtectedLayout />}>
                <Route index element={<PageLoadBoundary><Dashboard /></PageLoadBoundary>} />
                <Route path="mcp/consent" element={<FactoryOAuthConsent supabase={supabase} appOrigin={import.meta.env.VITE_MCP_APP_ORIGIN ?? ""} />} />
                <Route path="inventory/*" element={<PageLoadBoundary><InventoryRoutes /></PageLoadBoundary>} />
                <Route path="production/*" element={<PageLoadBoundary><ProductionRoutes /></PageLoadBoundary>} />
                <Route path="packaging/*" element={<PageLoadBoundary><PackagingRoutes /></PageLoadBoundary>} />
                <Route path="commercial/*" element={<PageLoadBoundary><CommercialRoutes /></PageLoadBoundary>} />
                <Route path="financial/*" element={<PageLoadBoundary><FinancialRoutes /></PageLoadBoundary>} />
                <Route path="reports/*" element={<PageLoadBoundary><ReportsRoutes /></PageLoadBoundary>} />
                <Route path="settings/*" element={<PageLoadBoundary><SettingsRoutes /></PageLoadBoundary>} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>); }
const router = createBrowserRouter([{path:'*',element:<ApplicationRoutes/>}]);

function App() {
  return (
      <ThemeProvider defaultTheme="light" storageKey="factory-theme">
        <AuthProvider>
          <ActorQueryBoundary>
            <RouterProvider router={router} />
          <Toaster position="top-left" richColors />
          </ActorQueryBoundary>
        </AuthProvider>
      </ThemeProvider>
  );
}

export default App;

