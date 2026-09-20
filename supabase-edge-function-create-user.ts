// ============================================================
// Edge Function: create-user
// Pega este código en: Supabase → Edge Functions → Deploy a new
// function → Via Editor → nómbrala exactamente "create-user"
// ============================================================
// Qué hace:
// 1. Verifica que quien llama esté realmente autenticado.
// 2. Verifica que sea un administrador activo (si no, rechaza).
// 3. Crea el usuario en Supabase Auth y le envía un correo de
//    invitación para que él mismo cree su contraseña.
// 4. Guarda su perfil (nombre, correo, rol) en la tabla "perfiles".
//
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya están disponibles
// automáticamente dentro de toda Edge Function — no hace falta
// configurarlas a mano.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 1. ¿Quién llama?
    const { data: { user: caller }, error: callerError } = await adminClient.auth.getUser(token);
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. ¿Es administrador activo?
    const { data: callerProfile } = await adminClient
      .from("perfiles")
      .select("activo, roles(nombre)")
      .eq("user_id", caller.id)
      .single();

    const esAdmin = callerProfile?.activo && callerProfile?.roles?.nombre === "admin";
    if (!esAdmin) {
      return new Response(JSON.stringify({ error: "Solo un administrador puede agregar usuarios" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Datos del nuevo usuario
    const { email, nombre, rol } = await req.json();
    if (!email || !nombre || !rol) {
      return new Response(JSON.stringify({ error: "Faltan datos (correo, nombre o rol)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rolRow, error: rolError } = await adminClient
      .from("roles").select("id").eq("nombre", rol).single();
    if (rolError || !rolRow) {
      return new Response(JSON.stringify({ error: "Rol no válido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Crear el usuario e invitarlo por correo
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { nombre },
    });
    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Guardar su perfil
    const { error: perfilError } = await adminClient.from("perfiles").insert({
      user_id: invited.user.id,
      nombre,
      email,
      rol_id: rolRow.id,
      activo: true,
    });
    if (perfilError) {
      return new Response(JSON.stringify({ error: perfilError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
