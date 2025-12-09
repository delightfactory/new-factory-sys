import { Routes, Route } from "react-router-dom";
import Parties from "./Parties";
import Treasuries from "./Treasuries";
import PurchaseInvoices from "./PurchaseInvoices";
import SalesInvoices from "./SalesInvoices";

import Payments from "./Payments";

import Returns from "./Returns";

const CommercialRoutes = () => {
    return (
        <Routes>
            <Route path="parties" element={<Parties />} />
            <Route path="treasuries" element={<Treasuries />} />
            <Route path="payments" element={<Payments />} />
            <Route path="returns" element={<Returns />} />
            <Route path="buying" element={<PurchaseInvoices />} />
            <Route path="selling" element={<SalesInvoices />} />
        </Routes>
    );
};

export default CommercialRoutes;
