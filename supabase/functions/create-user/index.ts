// @ts-nocheck
// Supabase Edge Function: create-user
// This function creates users using the Admin API (proper way)
// Requires SUPABASE_SERVICE_ROLE_KEY in environment

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { isNativeAccessToken } from './native-token.ts';

// CORS headers for browser requests
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CreateUserRequest {
    email: string;
    password: string;
    full_name: string;
    role: "admin" | "manager" | "accountant" | "inventory_officer" | "production_officer" | "viewer";
}

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // Only allow POST
        if (req.method !== "POST") {
            return new Response(
                JSON.stringify({ error: "Method not allowed" }),
                { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Get environment variables
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error("Missing environment variables");
        }

        // Create admin client with service role key
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        // Verify the requesting user is an admin
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: "Missing authorization header" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Get user from JWT token
        const token = authHeader.replace("Bearer ", "");
        const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !requestingUser || !isNativeAccessToken(token, requestingUser.id)) {
            return new Response(
                JSON.stringify({ error: "Invalid token" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Check if requesting user is admin
        const { data: profile, error: profileError } = await supabaseAdmin
            .from("profiles")
            .select("role,is_active")
            .eq("id", requestingUser.id)
            .single();

        if (profileError || !profile || profile.role !== "admin" || !profile.is_active) {
            return new Response(
                JSON.stringify({ error: "Access denied. Only admins can create users." }),
                { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Parse request body
        const body: CreateUserRequest = await req.json();
        const { email, password, full_name, role } = body;

        // Validate required fields
        if (!email || !password || !full_name || !role) {
            return new Response(
                JSON.stringify({ error: "Missing required fields: email, password, full_name, role" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Validate password length
        if (password.length < 6) {
            return new Response(
                JSON.stringify({ error: "Password must be at least 6 characters" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Validate role
        const validRoles = ["admin", "manager", "accountant", "inventory_officer", "production_officer", "viewer"];
        if (!validRoles.includes(role)) {
            return new Response(
                JSON.stringify({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Create user using Admin API (this creates proper auth.users and auth.identities records)
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm email
            user_metadata: {
                full_name,
            },
        });

        if (createError) {
            console.error("Error creating user:", createError);
            return new Response(
                JSON.stringify({ error: createError.message }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // The Auth transaction has committed its profile trigger before returning.
        // Require the persisted row; a successful HTTP write can affect zero rows.
        const { data: savedProfile, error: updateError } = await supabaseAdmin
            .from("profiles")
            .update({ role, full_name })
            .eq("id", newUser.user.id)
            .select("id,role,full_name")
            .single();

        if (updateError || !savedProfile || savedProfile.id !== newUser.user.id || savedProfile.role !== role || savedProfile.full_name !== full_name) {
            console.error("Created identity requires profile completion", { userId: newUser.user.id, code: updateError?.code ?? "PROFILE_MISMATCH" });
            // Preserve the created identity. Deleting it could cascade or lose an
            // account if another administrator has already acted on it.
            return new Response(JSON.stringify({
                success: false,
                code: "USER_PROFILE_INCOMPLETE",
                error: "تم إنشاء الحساب، لكن لم تكتمل بياناته وصلاحيته. أكمل إعداد الحساب الموجود.",
                user: { id: newUser.user.id, email: newUser.user.email },
            }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(
            JSON.stringify({
                success: true,
                user: {
                    id: newUser.user.id,
                    email: newUser.user.email,
                    full_name: savedProfile.full_name,
                    role: savedProfile.role,
                },
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Internal server error";
        console.error("Unexpected error:", err);
        return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
