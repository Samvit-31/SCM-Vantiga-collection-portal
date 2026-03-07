import {
  createServiceClient,
  isReceiptGeneratedFromPayload,
  processReceiptEmail,
} from "../_shared/receipt-email.ts";

const jsonHeaders = { "Content-Type": "application/json" };

function getSecretFromRequest(req: Request): string | null {
  return (
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-receipt-webhook-secret") ??
    null
  );
}

function validateWebhookSecret(req: Request): void {
  const configuredSecret = Deno.env.get("RECEIPT_WEBHOOK_SECRET");
  if (!configuredSecret) return;

  const providedSecret = getSecretFromRequest(req);
  if (providedSecret !== configuredSecret) {
    throw new Error("Unauthorized webhook secret.");
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Only POST is allowed." }),
      { status: 405, headers: jsonHeaders },
    );
  }

  try {
    validateWebhookSecret(req);

    const payload = await req.json();
    const record = payload?.record ?? null;
    const oldRecord = payload?.old_record ?? null;

    let entryId: string | null = null;
    let receiptNo: string | null = null;

    if (record) {
      const result = isReceiptGeneratedFromPayload(record, oldRecord);
      if (!result.shouldSend || !result.entryId || !result.receiptNo) {
        return new Response(
          JSON.stringify({
            ok: true,
            status: "ignored",
            reason: "receipt_no not newly generated for this event",
          }),
          { status: 200, headers: jsonHeaders },
        );
      }
      entryId = result.entryId;
      receiptNo = result.receiptNo;
    } else {
      entryId = typeof payload?.entry_id === "string" ? payload.entry_id.trim() : null;
      receiptNo = typeof payload?.receipt_no === "string" ? payload.receipt_no.trim() : null;

      if (!entryId || !receiptNo) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Missing payload. Provide webhook record/old_record or entry_id + receipt_no.",
          }),
          { status: 400, headers: jsonHeaders },
        );
      }
    }

    const supabase = createServiceClient();
    const result = await processReceiptEmail(supabase, entryId, receiptNo);

    return new Response(
      JSON.stringify({
        ok: true,
        entry_id: entryId,
        receipt_no: receiptNo,
        ...result,
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
