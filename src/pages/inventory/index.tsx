import { Routes, Route, Navigate } from "react-router-dom";
import RawMaterials from "./RawMaterials";
import PackagingMaterials from "./PackagingMaterials";
import SemiFinishedProducts from "./SemiFinishedProducts";
import FinishedProducts from "./FinishedProducts";
import Stocktaking from "./Stocktaking";

export default function InventoryRoutes() {
    return (
        <Routes>
            <Route index element={<Navigate to="raw-materials" replace />} />
            <Route path="raw-materials" element={<RawMaterials />} />
            <Route path="packaging" element={<PackagingMaterials />} />
            <Route path="semi-finished" element={<SemiFinishedProducts />} />
            <Route path="semi-finished" element={<SemiFinishedProducts />} />
            <Route path="finished" element={<FinishedProducts />} />
            <Route path="stocktaking" element={<Stocktaking />} />
        </Routes>
    );
}
