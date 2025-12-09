import { Routes, Route } from "react-router-dom";
import ReportsHub from "./ReportsHub";
import InventoryReport from "./InventoryReport";
import LowStockReport from "./LowStockReport";
import ProductionReport from "./ProductionReport";
import ProductPerformanceReport from "./ProductPerformanceReport";
import ExecutiveAnalytics from "./ExecutiveAnalytics";

export default function ReportsRoutes() {
    return (
        <Routes>
            <Route index element={<ReportsHub />} />
            <Route path="inventory" element={<InventoryReport />} />
            <Route path="low-stock" element={<LowStockReport />} />
            <Route path="production" element={<ProductionReport />} />
            <Route path="products" element={<ProductPerformanceReport />} />
            <Route path="executive" element={<ExecutiveAnalytics />} />
        </Routes>
    );
}
