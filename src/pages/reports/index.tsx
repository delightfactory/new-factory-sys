import { Routes, Route } from "react-router-dom";
import ReportsHub from "./ReportsHub";
import InventoryReport from "./InventoryReport";
import InventoryAnalytics from "./InventoryAnalytics";
import LowStockReport from "./LowStockReport";
import ProductionReport from "./ProductionReport";
import ProductPerformanceReport from "./ProductPerformanceReport";
import DecisionSupport from "./DecisionSupport";
import AgingReport from "./AgingReport";
import InventoryTurnoverReport from "./InventoryTurnoverReport";
import PartyAnalysisReport from "./PartyAnalysisReport";
import FinancialBalanceSheet from "./FinancialBalanceSheet";
import ExpenseAnalysisReport from "./ExpenseAnalysisReport";
import ProductCostCardReport from "./ProductCostCardReport";
import PricingAnalysisReport from "./PricingAnalysisReport";
import TrendsAnalyticsReport from "./TrendsAnalyticsReport";
import CashFlowReport from "./CashFlowReport";
import ProductJourneyReport from "./ProductJourneyReport";

export default function ReportsRoutes() {
    return (
        <Routes>
            <Route index element={<ReportsHub />} />
            <Route path="inventory" element={<InventoryReport />} />
            <Route path="inventory-analytics" element={<InventoryAnalytics />} />
            <Route path="low-stock" element={<LowStockReport />} />
            <Route path="production" element={<ProductionReport />} />
            <Route path="products" element={<ProductPerformanceReport />} />
            <Route path="executive" element={<DecisionSupport />} />
            <Route path="aging" element={<AgingReport />} />
            <Route path="turnover" element={<InventoryTurnoverReport />} />
            <Route path="party-analysis" element={<PartyAnalysisReport />} />
            <Route path="balance-sheet" element={<FinancialBalanceSheet />} />
            <Route path="expense-analysis" element={<ExpenseAnalysisReport />} />
            <Route path="cost-card" element={<ProductCostCardReport />} />
            <Route path="pricing-analysis" element={<PricingAnalysisReport />} />
            <Route path="trends" element={<TrendsAnalyticsReport />} />
            <Route path="cash-flow" element={<CashFlowReport />} />
            <Route path="product-journey" element={<ProductJourneyReport />} />
        </Routes>
    );
}

