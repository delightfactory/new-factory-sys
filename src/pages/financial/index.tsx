import { Routes, Route, Navigate } from "react-router-dom";
import Expenses from "./Expenses";
import Reports from "./Reports";

export default function FinancialRoutes() {
    return (
        <Routes>
            <Route path="expenses" element={<Expenses />} />
            <Route path="reports" element={<Reports />} />
            <Route index element={<Navigate to="reports" replace />} />
        </Routes>
    );
}
