import { Routes, Route, Navigate } from "react-router-dom";
import PackagingOrders from "./PackagingOrders";

const PackagingRoutes = () => {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="orders" replace />} />
            <Route path="orders" element={<PackagingOrders />} />
        </Routes>
    );
};

export default PackagingRoutes;
