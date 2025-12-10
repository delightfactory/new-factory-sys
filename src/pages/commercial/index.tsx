import { Routes, Route } from "react-router-dom";
import Parties from "./Parties";
import PartyDetails from "./PartyDetails";
import Treasuries from "./Treasuries";
import TreasuryDetails from "./TreasuryDetails";
import PurchaseInvoices from "./PurchaseInvoices";
import SalesInvoices from "./SalesInvoices";
import InvoiceDetails from "./InvoiceDetails";
import Payments from "./Payments";
import Returns from "./Returns";
import ReturnDetails from "./ReturnDetails";

const CommercialRoutes = () => {
    return (
        <Routes>
            <Route path="parties" element={<Parties />} />
            <Route path="parties/:id" element={<PartyDetails />} />
            <Route path="treasuries" element={<Treasuries />} />
            <Route path="treasuries/:id" element={<TreasuryDetails />} />
            <Route path="payments" element={<Payments />} />
            <Route path="returns" element={<Returns />} />
            <Route path="returns/:type/:id" element={<ReturnDetails />} />
            <Route path="buying" element={<PurchaseInvoices />} />
            <Route path="buying/:id" element={<InvoiceDetails />} />
            <Route path="selling" element={<SalesInvoices />} />
            <Route path="selling/:id" element={<InvoiceDetails />} />
        </Routes>
    );
};

export default CommercialRoutes;
