import {
  createServiceClient,
  generateReceiptPdfForEntry,
} from "../_shared/receipt-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };

function fileSafeReceiptName(receiptNo: string): string {
  const normalized = receiptNo.replace(/[\\/:*?"<>|]+/g, "-").trim();
  return normalized.length > 0 ? `Receipt-${normalized}.pdf` : "Receipt.pdf";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Only POST is allowed." }),
      { status: 405, headers: jsonHeaders },
    );
  }

  try {
    const body = await req.json();
    const entryId = typeof body?.entry_id === "string" ? body.entry_id.trim() : "";
    const receiptNo = typeof body?.receipt_no === "string" ? body.receipt_no.trim() : "";

    if (!entryId || !receiptNo) {
      return new Response(
        JSON.stringify({ ok: false, error: "entry_id and receipt_no are required." }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const supabase = createServiceClient();
    const { payload, pdfBase64 } = await generateReceiptPdfForEntry(supabase, entryId, receiptNo);
    const filename = fileSafeReceiptName(payload.receiptNo);

    return new Response(
      JSON.stringify({
        ok: true,
        entry_id: entryId,
        receipt_no: payload.receiptNo,
        filename,
        pdf_base64: pdfBase64,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
