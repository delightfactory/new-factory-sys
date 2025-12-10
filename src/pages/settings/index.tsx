
import { Routes, Route, Navigate } from "react-router-dom";
import UsersManager from "./users-manager";
import SystemSettings from "./SystemSettings";

export default function SettingsRoutes() {
    return (
        <Routes>
            <Route index element={<Navigate to="users" replace />} />
            <Route path="users" element={<UsersManager />} />
            <Route path="system" element={<SystemSettings />} />
        </Routes>
    );
}
