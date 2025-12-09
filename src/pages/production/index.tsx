import { Routes, Route, Navigate } from "react-router-dom";
import ProductionOrders from "./ProductionOrders";

const ProductionRoutes = () => {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="orders" replace />} />
            <Route path="orders" element={<ProductionOrders />} />
        </Routes>
    );
};

export default ProductionRoutes;
