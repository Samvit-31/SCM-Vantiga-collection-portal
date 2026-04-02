import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type RejectionDispatchStatus = "pending" | "processing" | "sent" | "failed";

export interface RejectionDispatchRow {
  id: string;
  entry_id: string;
  rejected_at: string;
  payer_email: string | null;
  rejection_reason: string;
  status: RejectionDispatchStatus;
  attempt_count: number;
  last_error: string | null;
  provider_message_id: string | null;
}

interface RejectionPayload {
  entryId: string;
  rejectedAt: string;
  payerEmail: string;
  payerName: string;
  sabhaName: string;
  rejectionReason: string;
  totalAmount: number;
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatAmountIndian(value: number): string {
  try {
    return value.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return value.toFixed(2);
  }
}

export function createServiceClient() {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceRoleKey);
}

export function isRejectionGeneratedFromPayload(
  record: Record<string, unknown> | null | undefined,
  oldRecord?: Record<string, unknown> | null,
): { shouldSend: boolean; entryId: string | null; rejectedAt: string | null } {
  const entryId = optionalTrimmed(record?.id);
  const newStatus = optionalTrimmed(record?.status);
  const oldStatus = optionalTrimmed(oldRecord?.status);
  const rejectedAt = optionalTrimmed(record?.acknowledged_at);
  const rejectionReason = optionalTrimmed(record?.rejection_reason);

  if (!entryId || newStatus !== "REJECTED" || !rejectedAt || !rejectionReason) {
    return { shouldSend: false, entryId, rejectedAt };
  }

  return {
    shouldSend: oldStatus !== "REJECTED",
    entryId,
    rejectedAt,
  };
}

export async function loadDispatchRow(
  supabase: ReturnType<typeof createServiceClient>,
  entryId: string,
  rejectedAt: string,
): Promise<RejectionDispatchRow | null> {
  const { data, error } = await supabase
    .from("rejection_email_dispatch")
    .select("*")
    .eq("entry_id", entryId)
    .eq("rejected_at", rejectedAt)
    .maybeSingle();

  if (error) throw error;
  return (data as RejectionDispatchRow | null) ?? null;
}

export async function loadLatestDispatchRow(
  supabase: ReturnType<typeof createServiceClient>,
  entryId: string,
): Promise<RejectionDispatchRow | null> {
  const { data, error } = await supabase
    .from("rejection_email_dispatch")
    .select("*")
    .eq("entry_id", entryId)
    .order("rejected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as RejectionDispatchRow | null) ?? null;
}

export async function upsertDispatch(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    entryId: string;
    rejectedAt: string;
    payerEmail: string | null;
    rejectionReason: string;
    status: RejectionDispatchStatus;
    attemptCount: number;
    lastError?: string | null;
    providerMessageId?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("rejection_email_dispatch").upsert(
    {
      entry_id: input.entryId,
      rejected_at: input.rejectedAt,
      payer_email: input.payerEmail,
      rejection_reason: input.rejectionReason,
      status: input.status,
      attempt_count: input.attemptCount,
      last_error: input.lastError ?? null,
      provider_message_id: input.providerMessageId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "entry_id,rejected_at" },
  );

  if (error) throw error;
}

async function ensureDispatchRow(
  supabase: ReturnType<typeof createServiceClient>,
  entryId: string,
  rejectedAt: string,
): Promise<RejectionDispatchRow> {
  const existing = await loadDispatchRow(supabase, entryId, rejectedAt);
  if (!existing) {
    throw new Error("Unable to locate rejection email dispatch row.");
  }
  return existing;
}

async function claimDispatchForSending(
  supabase: ReturnType<typeof createServiceClient>,
  dispatch: RejectionDispatchRow,
): Promise<{ claimed: boolean; attemptCount: number }> {
  const nextAttemptCount = (dispatch.attempt_count ?? 0) + 1;

  const { data, error } = await supabase
    .from("rejection_email_dispatch")
    .update({
      status: "processing",
      attempt_count: nextAttemptCount,
      last_error: null,
      provider_message_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("entry_id", dispatch.entry_id)
    .eq("rejected_at", dispatch.rejected_at)
    .eq("attempt_count", dispatch.attempt_count)
    .in("status", ["pending", "failed"])
    .select("entry_id");

  if (error) throw error;

  return {
    claimed: Array.isArray(data) && data.length > 0,
    attemptCount: nextAttemptCount,
  };
}

export async function fetchRejectionPayload(
  supabase: ReturnType<typeof createServiceClient>,
  entryId: string,
  expectedRejectedAt: string,
): Promise<RejectionPayload> {
  const dispatch = await ensureDispatchRow(supabase, entryId, expectedRejectedAt);

  const { data, error } = await supabase
    .from("vantiga_entries")
    .select(`
      id,
      families:family_id (
        payer_email,
        family_members (
          full_name,
          is_primary_payer,
          amount
        ),
        sabhas:sabha_id (
          name
        )
      )
    `)
    .eq("id", entryId)
    .single();

  if (error) throw error;

  const family = Array.isArray(data?.families) ? data.families[0] : data?.families;
  const members = Array.isArray(family?.family_members) ? family.family_members : [];
  const familySabha = Array.isArray(family?.sabhas) ? family.sabhas[0] : family?.sabhas;

  const payerEmail = optionalTrimmed(dispatch.payer_email) || optionalTrimmed(family?.payer_email);
  if (!payerEmail) {
    throw new Error("Payer email is missing for this rejection.");
  }

  const payerName =
    members.find((member: { full_name?: string | null; is_primary_payer?: boolean | null }) => member?.is_primary_payer)?.full_name?.trim() ||
    members[0]?.full_name?.trim() ||
    "Vantiga Member";
  const totalAmount = members.reduce((sum, member: { amount?: number | string | null }) => {
    const amount = Number(member?.amount || 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  return {
    entryId,
    rejectedAt: dispatch.rejected_at,
    payerEmail,
    payerName,
    sabhaName: optionalTrimmed(familySabha?.name) || "-",
    rejectionReason: dispatch.rejection_reason,
    totalAmount,
  };
}

export async function sendViaResend(
  payload: RejectionPayload,
): Promise<string> {
  const resendApiKey = requiredEnv("RESEND_API_KEY");
  const fromAddress = requiredEnv("RECEIPT_EMAIL_FROM");
  const subject = "Your Vantiga Entry Was Rejected";

  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827;">
      <p>Jai Shankar,</p>
      <p>Your Vantiga entry for <strong>${escapeHtml(payload.sabhaName)}</strong> has been rejected.</p>
      <p><strong>Payer Name:</strong> ${escapeHtml(payload.payerName)}<br/>
      <strong>Amount:</strong> INR ${escapeHtml(formatAmountIndian(payload.totalAmount))}<br/>
      <strong>Reason:</strong> ${escapeHtml(payload.rejectionReason)}</p>
      <p>Please contact your Sabha representative and re-submit the entry after making the required corrections.</p>
      <p>Regards,<br/>Shri Chitrapur Math</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [payload.payerEmail],
      subject,
      html,
    }),
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`Resend API failed (${response.status}): ${responseBody}`);
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    // Ignore parse failure; successful status already confirms the send.
  }

  return optionalTrimmed(parsed.id) || "unknown";
}

export async function processRejectionEmail(
  supabase: ReturnType<typeof createServiceClient>,
  entryId: string,
  rejectedAt: string,
): Promise<{ status: "sent" | "skipped"; message: string }> {
  const existing = await ensureDispatchRow(supabase, entryId, rejectedAt);
  if (existing.status === "sent") {
    return { status: "skipped", message: "Email already sent for this rejection event." };
  }
  if (existing.status === "processing") {
    return { status: "skipped", message: "Email dispatch is already in progress for this rejection event." };
  }

  const claim = await claimDispatchForSending(supabase, existing);
  if (!claim.claimed) {
    const latest = await loadDispatchRow(supabase, entryId, rejectedAt);
    if (latest?.status === "sent") {
      return { status: "skipped", message: "Email already sent for this rejection event." };
    }
    if (latest?.status === "processing") {
      return { status: "skipped", message: "Email dispatch is already in progress for this rejection event." };
    }
    return { status: "skipped", message: "Another worker already claimed this rejection email dispatch." };
  }

  let rejectionPayload: RejectionPayload | null = null;
  try {
    rejectionPayload = await fetchRejectionPayload(supabase, entryId, rejectedAt);
    const providerMessageId = await sendViaResend(rejectionPayload);

    await upsertDispatch(supabase, {
      entryId,
      rejectedAt,
      payerEmail: rejectionPayload.payerEmail,
      rejectionReason: rejectionPayload.rejectionReason,
      status: "sent",
      attemptCount: claim.attemptCount,
      lastError: null,
      providerMessageId,
    });

    return { status: "sent", message: `Email sent to ${rejectionPayload.payerEmail}` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await upsertDispatch(supabase, {
      entryId,
      rejectedAt,
      payerEmail: rejectionPayload?.payerEmail ?? existing.payer_email ?? null,
      rejectionReason: rejectionPayload?.rejectionReason ?? existing.rejection_reason,
      status: "failed",
      attemptCount: claim.attemptCount,
      lastError: errorMessage,
      providerMessageId: null,
    });

    throw error;
  }
}
