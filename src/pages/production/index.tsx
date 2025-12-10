import { Routes, Route, Navigate } from "react-router-dom";
import ProductionOrders from "./ProductionOrders";
import ProductionOrderDetails from "./ProductionOrderDetails";

const ProductionRoutes = () => {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="orders" replace />} />
            <Route path="orders" element={<ProductionOrders />} />
            <Route path="orders/:id" element={<ProductionOrderDetails />} />
        </Routes>
    );
};

export default ProductionRoutes;

