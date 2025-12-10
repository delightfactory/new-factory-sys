import { Routes, Route, Navigate } from "react-router-dom";
import PackagingOrders from "./PackagingOrders";

import PackagingOrderDetails from "./PackagingOrderDetails";

const PackagingRoutes = () => {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="orders" replace />} />
            <Route path="orders" element={<PackagingOrders />} />
            <Route path="orders/:id" element={<PackagingOrderDetails />} />
        </Routes>
    );
};

export default PackagingRoutes;
