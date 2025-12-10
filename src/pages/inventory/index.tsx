import { Routes, Route, Navigate } from "react-router-dom";
import RawMaterials from "./RawMaterials";
import PackagingMaterials from "./PackagingMaterials";
import SemiFinishedProducts from "./SemiFinishedProducts";
import FinishedProducts from "./FinishedProducts";
import Stocktaking from "./Stocktaking";
import StocktakingDetails from "./StocktakingDetails";
import InventoryMovements from "./InventoryMovements";
import MovementDetails from "./MovementDetails";
import ItemDetails from "./ItemDetails";

export default function InventoryRoutes() {
    return (
        <Routes>
            <Route index element={<Navigate to="raw-materials" replace />} />
            <Route path="raw-materials" element={<RawMaterials />} />
            <Route path="raw-materials/:id" element={<ItemDetails />} />
            <Route path="packaging" element={<PackagingMaterials />} />
            <Route path="packaging/:id" element={<ItemDetails />} />
            <Route path="semi-finished" element={<SemiFinishedProducts />} />
            <Route path="semi-finished/:id" element={<ItemDetails />} />
            <Route path="finished" element={<FinishedProducts />} />
            <Route path="finished/:id" element={<ItemDetails />} />
            <Route path="stocktaking" element={<Stocktaking />} />
            <Route path="stocktaking/:id" element={<StocktakingDetails />} />
            <Route path="movements" element={<InventoryMovements />} />
            <Route path="movements/:id" element={<MovementDetails />} />
        </Routes>
    );
}

