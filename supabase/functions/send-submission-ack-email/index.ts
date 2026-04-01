import {
  createServiceClient,
  isSubmissionAckGeneratedFromPayload,
  processSubmissionAckEmail,
} from "../_shared/submission-ack-email.ts";

const jsonHeaders = { "Content-Type": "application/json" };

function getSecretFromRequest(req: Request): string | null {
  return (
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-submission-webhook-secret") ??
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
    let submittedAt: string | null = null;

    if (record) {
      const result = isSubmissionAckGeneratedFromPayload(record, oldRecord);
      if (!result.shouldSend || !result.entryId || !result.submittedAt) {
        return new Response(
          JSON.stringify({
            ok: true,
            status: "ignored",
            reason: "submission acknowledgement not newly generated for this event",
          }),
          { status: 200, headers: jsonHeaders },
        );
      }
      entryId = result.entryId;
      submittedAt = result.submittedAt;
    } else {
      entryId = typeof payload?.entry_id === "string" ? payload.entry_id.trim() : null;
      submittedAt = typeof payload?.submitted_at === "string" ? payload.submitted_at.trim() : null;

      if (!entryId || !submittedAt) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Missing payload. Provide webhook record/old_record or entry_id + submitted_at.",
          }),
          { status: 400, headers: jsonHeaders },
        );
      }
    }

    const supabase = createServiceClient();
    const result = await processSubmissionAckEmail(supabase, entryId, submittedAt);

    return new Response(
      JSON.stringify({
        ok: true,
        entry_id: entryId,
        submitted_at: submittedAt,
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
