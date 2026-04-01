// Supabase Edge Function — Notification email pour nouvelles demandes
// Déclenchée par un Database Webhook sur INSERT dans la table "demandes"

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = "Artisano <noreply@artisano.ch>"; // Modifier avec votre domaine vérifié sur Resend

interface DemandePayload {
  type: "INSERT";
  table: string;
  record: {
    id: string;
    artisan_id: string;
    client_nom: string;
    client_email: string;
    client_telephone: string;
    message: string;
    type: string;
    date_souhaitee: string | null;
    creneau_heure: string | null;
    statut: string;
    created_at: string;
  };
}

serve(async (req: Request) => {
  try {
    const payload: DemandePayload = await req.json();
    const demande = payload.record;

    if (!demande || !demande.artisan_id) {
      return new Response(JSON.stringify({ error: "No demande data" }), { status: 400 });
    }

    // Récupérer l'email de l'artisan via Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const artisanRes = await fetch(
      `${supabaseUrl}/rest/v1/artisans?id=eq.${demande.artisan_id}&select=email,entreprise,prenom,nom`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );
    const artisans = await artisanRes.json();
    if (!artisans || artisans.length === 0) {
      return new Response(JSON.stringify({ error: "Artisan not found" }), { status: 404 });
    }

    const artisan = artisans[0];
    const artisanEmail = artisan.email;
    const artisanName = artisan.entreprise || `${artisan.prenom || ""} ${artisan.nom || ""}`.trim() || "Artisan";

    if (!artisanEmail) {
      return new Response(JSON.stringify({ error: "No artisan email" }), { status: 400 });
    }

    // === EMAIL 1 : Notification à l'artisan ===
    const typeLabel = demande.type === "devis" ? "Demande de devis" : demande.type === "message" ? "Message" : "Demande";
    const creneauInfo = demande.date_souhaitee
      ? `<p><strong>Date souhaitée :</strong> ${demande.date_souhaitee}${demande.creneau_heure ? ` à ${demande.creneau_heure}` : ""}</p>`
      : "";

    const artisanHtml = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E5E3DE;">
        <div style="background:#E8700A;padding:24px 32px;">
          <h1 style="color:white;margin:0;font-size:20px;">Nouvelle demande reçue !</h1>
        </div>
        <div style="padding:28px 32px;">
          <p style="margin:0 0 16px;color:#555;">Bonjour <strong>${artisanName}</strong>,</p>
          <p style="margin:0 0 20px;color:#555;">Vous avez reçu une nouvelle demande sur Artisano :</p>
          <div style="background:#F7F6F3;border-radius:8px;padding:20px;margin-bottom:20px;">
            <p style="margin:0 0 8px;"><strong>Client :</strong> ${demande.client_nom}</p>
            <p style="margin:0 0 8px;"><strong>Email :</strong> ${demande.client_email}</p>
            ${demande.client_telephone ? `<p style="margin:0 0 8px;"><strong>Téléphone :</strong> ${demande.client_telephone}</p>` : ""}
            <p style="margin:0 0 8px;"><strong>Type :</strong> ${typeLabel}</p>
            ${creneauInfo}
            ${demande.message ? `<p style="margin:8px 0 0;"><strong>Message :</strong><br>${demande.message.substring(0, 300)}</p>` : ""}
          </div>
          <a href="https://artisano.ch/dashboard.html" style="display:inline-block;background:#E8700A;color:white;padding:12px 28px;border-radius:50px;text-decoration:none;font-weight:700;font-size:14px;">Voir dans mon dashboard</a>
        </div>
        <div style="padding:16px 32px;background:#F7F6F3;text-align:center;font-size:12px;color:#999;">
          Artisano — Trouve ton artisan en 2 clics
        </div>
      </div>
    `;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [artisanEmail],
        subject: `Nouvelle demande de ${demande.client_nom} | Artisano`,
        html: artisanHtml,
      }),
    });

    // === EMAIL 2 : Confirmation au client ===
    if (demande.client_email) {
      const clientHtml = `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E5E3DE;">
          <div style="background:#E8700A;padding:24px 32px;">
            <h1 style="color:white;margin:0;font-size:20px;">Demande envoyée avec succès !</h1>
          </div>
          <div style="padding:28px 32px;">
            <p style="margin:0 0 16px;color:#555;">Bonjour <strong>${demande.client_nom}</strong>,</p>
            <p style="margin:0 0 20px;color:#555;">Votre demande a bien été transmise à <strong>${artisanName}</strong>. L'artisan vous contactera rapidement.</p>
            <div style="background:#F7F6F3;border-radius:8px;padding:20px;margin-bottom:20px;">
              <p style="margin:0 0 8px;"><strong>Type :</strong> ${typeLabel}</p>
              ${creneauInfo}
              ${demande.message ? `<p style="margin:8px 0 0;"><strong>Votre message :</strong><br>${demande.message.substring(0, 200)}</p>` : ""}
            </div>
            <p style="color:#999;font-size:13px;">Vous pouvez suivre vos demandes depuis votre espace client.</p>
          </div>
          <div style="padding:16px 32px;background:#F7F6F3;text-align:center;font-size:12px;color:#999;">
            Artisano — Trouve ton artisan en 2 clics
          </div>
        </div>
      `;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [demande.client_email],
          subject: `Votre demande a été envoyée à ${artisanName} | Artisano`,
          html: clientHtml,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
