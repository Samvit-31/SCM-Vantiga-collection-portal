import { createServiceClient, processReceiptEmail } from "../_shared/receipt-email.ts";

const jsonHeaders = { "Content-Type": "application/json" };

function validateRetrySecret(req: Request): void {
  const configuredSecret = Deno.env.get("RECEIPT_WEBHOOK_SECRET");
  if (!configuredSecret) return;

  const providedSecret =
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-retry-secret") ??
    null;

  if (providedSecret !== configuredSecret) {
    throw new Error("Unauthorized retry request.");
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
    validateRetrySecret(req);

    const body = await req.json().catch(() => ({}));
    const maxAttempts = Number.isFinite(Number(body?.max_attempts))
      ? Math.max(1, Number(body.max_attempts))
      : 5;
    const limit = Number.isFinite(Number(body?.limit))
      ? Math.min(100, Math.max(1, Number(body.limit)))
      : 25;

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("receipt_email_dispatch")
      .select("entry_id, receipt_no, status, attempt_count")
      .in("status", ["pending", "failed"])
      .lt("attempt_count", maxAttempts)
      .order("updated_at", { ascending: true })
      .limit(limit);

    if (error) throw error;

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const details: Array<Record<string, string | number>> = [];

    for (const row of data || []) {
      try {
        const result = await processReceiptEmail(supabase, row.entry_id, row.receipt_no);
        if (result.status === "sent") sent += 1;
        if (result.status === "skipped") skipped += 1;
        details.push({
          entry_id: row.entry_id,
          receipt_no: row.receipt_no,
          status: result.status,
          message: result.message,
        });
      } catch (processError) {
        failed += 1;
        details.push({
          entry_id: row.entry_id,
          receipt_no: row.receipt_no,
          status: "failed",
          message: processError instanceof Error ? processError.message : String(processError),
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: (data || []).length,
        sent,
        skipped,
        failed,
        details,
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
