
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import Dashboard from "./pages/Dashboard";
import InventoryRoutes from "./pages/inventory";
import ProductionRoutes from "./pages/production";
import PackagingRoutes from "./pages/packaging";
import CommercialRoutes from "./pages/commercial";
import FinancialRoutes from "./pages/financial";

import { AuthProvider } from "./contexts/AuthContext";
import Login from "./pages/auth/Login";
import ProtectedLayout from "./components/ProtectedLayout";
import SettingsRoutes from "./pages/settings";
import ReportsRoutes from "./pages/reports";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/" element={<ProtectedLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="inventory/*" element={<InventoryRoutes />} />
              <Route path="production/*" element={<ProductionRoutes />} />
              <Route path="packaging/*" element={<PackagingRoutes />} />
              <Route path="commercial/*" element={<CommercialRoutes />} />
              <Route path="financial/*" element={<FinancialRoutes />} />
              <Route path="reports/*" element={<ReportsRoutes />} />
              <Route path="settings/*" element={<SettingsRoutes />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-left" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
