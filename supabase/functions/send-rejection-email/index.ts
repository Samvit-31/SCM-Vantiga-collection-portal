import {
  createServiceClient,
  isRejectionGeneratedFromPayload,
  loadLatestDispatchRow,
  processRejectionEmail,
} from "../_shared/rejection-email.ts";

const jsonHeaders = { "Content-Type": "application/json" };

function getSecretFromRequest(req: Request): string | null {
  return (
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-rejection-webhook-secret") ??
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
    let rejectedAt: string | null = null;

    if (record) {
      const result = isRejectionGeneratedFromPayload(record, oldRecord);
      if (!result.shouldSend || !result.entryId || !result.rejectedAt) {
        return new Response(
          JSON.stringify({
            ok: true,
            status: "ignored",
            reason: "status did not newly transition to REJECTED for this event",
          }),
          { status: 200, headers: jsonHeaders },
        );
      }
      entryId = result.entryId;
      rejectedAt = result.rejectedAt;
    } else {
      entryId = typeof payload?.entry_id === "string" ? payload.entry_id.trim() : null;
      rejectedAt = typeof payload?.rejected_at === "string" ? payload.rejected_at.trim() : null;

      if (entryId && !rejectedAt) {
        const supabase = createServiceClient();
        const latest = await loadLatestDispatchRow(supabase, entryId);
        if (!latest) {
          return new Response(
            JSON.stringify({ ok: false, error: "No rejection dispatch row found for the provided entry_id." }),
            { status: 404, headers: jsonHeaders },
          );
        }

        const result = await processRejectionEmail(supabase, entryId, latest.rejected_at);
        return new Response(
          JSON.stringify({
            ok: true,
            entry_id: entryId,
            rejected_at: latest.rejected_at,
            ...result,
          }),
          { status: 200, headers: jsonHeaders },
        );
      }

      if (!entryId || !rejectedAt) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Missing payload. Provide webhook record/old_record or entry_id + rejected_at.",
          }),
          { status: 400, headers: jsonHeaders },
        );
      }
    }

    const supabase = createServiceClient();
    const result = await processRejectionEmail(supabase, entryId, rejectedAt);

    return new Response(
      JSON.stringify({
        ok: true,
        entry_id: entryId,
        rejected_at: rejectedAt,
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
