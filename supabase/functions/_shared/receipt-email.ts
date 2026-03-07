import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ReceiptDispatchStatus = "pending" | "sent" | "failed";

export interface ReceiptDispatchRow {
  id: string;
  entry_id: string;
  receipt_no: string;
  payer_email: string | null;
  status: ReceiptDispatchStatus;
  attempt_count: number;
  last_error: string | null;
  provider_message_id: string | null;
}

interface ReceiptMember {
  full_name: string | null;
  amount: number | null;
  is_primary_payer: boolean | null;
}

interface ReceiptPayload {
  entryId: string;
  receiptNo: string;
  fy: string;
  paidBy: string;
  referenceNo: string | null;
  submittedAt: string | null;
  acknowledgedAt: string | null;
  payerEmail: string;
  payerMobile: string | null;
  payerName: string;
  address: string | null;
  sabhaName: string;
  sabhaCode: string | null;
  totalAmount: number;
  members: ReceiptMember[];
}

const EMAIL_BODY_COPY = `
Namaskar,

Thank you for your contribution. Please find your digital receipt attached as a PDF.
Keep this receipt for your records and future reference.

If you have any questions, please contact your Sabha representative.
`;

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

function formatDate(value: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function formatAmount(value: number): string {
  return value.toFixed(2);
}

export function createServiceClient() {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceRoleKey);
}

export function isReceiptGeneratedFromPayload(record: Record<string, unknown> | null | undefined, oldRecord?: Record<string, unknown> | null): {
  shouldSend: boolean;
  entryId: string | null;
  receiptNo: string | null;
} {
  const entryId = optionalTrimmed(record?.id);
  const receiptNo = optionalTrimmed(record?.receipt_no);
  const oldReceiptNo = optionalTrimmed(oldRecord?.receipt_no);

  if (!entryId || !receiptNo) {
    return { shouldSend: false, entryId, receiptNo };
  }

  const shouldSend = oldReceiptNo !== receiptNo;
  return { shouldSend, entryId, receiptNo };
}

export async function loadDispatchRow(
  supabase: ReturnType<typeof createServiceClient>,
  entryId: string,
  receiptNo: string,
): Promise<ReceiptDispatchRow | null> {
  const { data, error } = await supabase
    .from("receipt_email_dispatch")
    .select("*")
    .eq("entry_id", entryId)
    .eq("receipt_no", receiptNo)
    .maybeSingle();

  if (error) throw error;
  return (data as ReceiptDispatchRow | null) ?? null;
}

export async function upsertDispatch(
  supabase: ReturnType<typeof createServiceClient>,
  input: {
    entryId: string;
    receiptNo: string;
    payerEmail: string | null;
    status: ReceiptDispatchStatus;
    attemptCount: number;
    lastError?: string | null;
    providerMessageId?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("receipt_email_dispatch").upsert(
    {
      entry_id: input.entryId,
      receipt_no: input.receiptNo,
      payer_email: input.payerEmail,
      status: input.status,
      attempt_count: input.attemptCount,
      last_error: input.lastError ?? null,
      provider_message_id: input.providerMessageId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "entry_id,receipt_no" },
  );

  if (error) throw error;
}

export async function fetchReceiptPayload(
  supabase: ReturnType<typeof createServiceClient>,
  entryId: string,
  expectedReceiptNo: string,
): Promise<ReceiptPayload> {
  const { data, error } = await supabase
    .from("vantiga_entries")
    .select(`
      id,
      fy,
      paid_by,
      reference_no,
      submitted_at,
      acknowledged_at,
      receipt_no,
      sabhas:sabha_id (
        name,
        code
      ),
      families:family_id (
        payer_email,
        payer_mobile,
        address_multiline,
        family_members (
          full_name,
          amount,
          is_primary_payer
        )
      )
    `)
    .eq("id", entryId)
    .single();

  if (error) throw error;

  const receiptNo = optionalTrimmed(data?.receipt_no);
  if (!receiptNo || receiptNo !== expectedReceiptNo) {
    throw new Error("Entry receipt number is missing or does not match expected receipt number.");
  }

  const family = Array.isArray(data?.families) ? data.families[0] : data?.families;
  const sabha = Array.isArray(data?.sabhas) ? data.sabhas[0] : data?.sabhas;
  const members = Array.isArray(family?.family_members) ? family.family_members : [];

  const payerEmail = optionalTrimmed(family?.payer_email);
  if (!payerEmail) {
    throw new Error("Payer email is missing for this entry.");
  }

  const payerName =
    members.find((member: ReceiptMember) => member?.is_primary_payer)?.full_name?.trim() ||
    members[0]?.full_name?.trim() ||
    "Vantiga Member";

  const totalAmount = members.reduce((sum: number, member: ReceiptMember) => {
    const amount = Number(member?.amount || 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  return {
    entryId: data.id,
    receiptNo,
    fy: data?.fy || "-",
    paidBy: data?.paid_by || "-",
    referenceNo: optionalTrimmed(data?.reference_no),
    submittedAt: optionalTrimmed(data?.submitted_at),
    acknowledgedAt: optionalTrimmed(data?.acknowledged_at),
    payerEmail,
    payerMobile: optionalTrimmed(family?.payer_mobile),
    payerName,
    address: optionalTrimmed(family?.address_multiline),
    sabhaName: optionalTrimmed(sabha?.name) || "-",
    sabhaCode: optionalTrimmed(sabha?.code),
    totalAmount,
    members,
  };
}

export async function buildReceiptPdf(payload: ReceiptPayload): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let y = 800;
  const left = 48;
  const lineGap = 16;

  page.drawText("Shri Chitrapur Math - Digital Vantiga Receipt", {
    x: left,
    y,
    size: 16,
    font: titleFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  y -= lineGap + 8;
  page.drawText(`Receipt No: ${payload.receiptNo}`, { x: left, y, size: 11, font: bodyFont });
  y -= lineGap;
  page.drawText(`Sabha: ${payload.sabhaName}${payload.sabhaCode ? ` (${payload.sabhaCode})` : ""}`, {
    x: left,
    y,
    size: 11,
    font: bodyFont,
  });
  y -= lineGap;
  page.drawText(`FY: ${payload.fy}`, { x: left, y, size: 11, font: bodyFont });
  y -= lineGap;
  page.drawText(`Payment Mode: ${payload.paidBy}`, { x: left, y, size: 11, font: bodyFont });

  if (payload.referenceNo) {
    y -= lineGap;
    page.drawText(`Reference No: ${payload.referenceNo}`, { x: left, y, size: 11, font: bodyFont });
  }

  y -= lineGap;
  page.drawText(`Date: ${formatDate(payload.acknowledgedAt || payload.submittedAt)}`, {
    x: left,
    y,
    size: 11,
    font: bodyFont,
  });

  y -= lineGap + 8;
  page.drawText(`Payer Name: ${payload.payerName}`, { x: left, y, size: 11, font: bodyFont });
  y -= lineGap;
  page.drawText(`Payer Email: ${payload.payerEmail}`, { x: left, y, size: 11, font: bodyFont });
  y -= lineGap;
  page.drawText(`Payer Mobile: ${payload.payerMobile || "-"}`, { x: left, y, size: 11, font: bodyFont });

  if (payload.address) {
    y -= lineGap;
    page.drawText(`Address: ${payload.address.replaceAll("\n", ", ")}`, {
      x: left,
      y,
      size: 11,
      font: bodyFont,
    });
  }

  y -= lineGap + 8;
  page.drawText(`Total Amount: INR ${formatAmount(payload.totalAmount)}`, {
    x: left,
    y,
    size: 12,
    font: titleFont,
  });

  y -= lineGap + 6;
  page.drawText("Members:", {
    x: left,
    y,
    size: 11,
    font: titleFont,
  });

  for (const member of payload.members) {
    y -= lineGap;
    if (y < 80) break;
    const name = optionalTrimmed(member?.full_name) || "Member";
    const amount = Number(member?.amount || 0);
    page.drawText(`- ${name}: INR ${formatAmount(Number.isFinite(amount) ? amount : 0)}`, {
      x: left + 8,
      y,
      size: 10,
      font: bodyFont,
    });
  }

  y -= lineGap + 10;
  page.drawText("No signature required. This is a system-generated receipt.", {
    x: left,
    y,
    size: 9,
    font: bodyFont,
    color: rgb(0.25, 0.25, 0.25),
  });

  const pdfBytes = await pdfDoc.save();
  let binary = "";
  for (const byte of pdfBytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function sendViaResend(
  payload: ReceiptPayload,
  pdfBase64: string,
): Promise<string> {
  const resendApiKey = requiredEnv("RESEND_API_KEY");
  const fromAddress = requiredEnv("RECEIPT_EMAIL_FROM");
  const subject = `Receipt ${payload.receiptNo}`;
  const safePayerName = escapeHtml(payload.payerName);
  const safeSabhaName = escapeHtml(payload.sabhaName);

  const html = `
    <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111827;">
      <p>${EMAIL_BODY_COPY.trim().replaceAll("\n", "<br/>")}</p>
      <p><strong>Receipt Number:</strong> ${escapeHtml(payload.receiptNo)}<br/>
      <strong>Payer Name:</strong> ${safePayerName}<br/>
      <strong>Sabha:</strong> ${safeSabhaName}<br/>
      <strong>Total Amount:</strong> INR ${formatAmount(payload.totalAmount)}</p>
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
      attachments: [
        {
          filename: `receipt-${payload.receiptNo}.pdf`,
          content: pdfBase64,
        },
      ],
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
    // Keep parsed empty; response body already validated by status code.
  }

  const messageId = optionalTrimmed(parsed.id) || "unknown";
  return messageId;
}

export async function processReceiptEmail(
  supabase: ReturnType<typeof createServiceClient>,
  entryId: string,
  receiptNo: string,
): Promise<{ status: "sent" | "skipped"; message: string }> {
  const existing = await loadDispatchRow(supabase, entryId, receiptNo);
  if (existing?.status === "sent") {
    return { status: "skipped", message: "Email already sent for this receipt number." };
  }

  const nextAttemptCount = (existing?.attempt_count ?? 0) + 1;

  let receiptPayload: ReceiptPayload | null = null;
  try {
    receiptPayload = await fetchReceiptPayload(supabase, entryId, receiptNo);

    await upsertDispatch(supabase, {
      entryId,
      receiptNo,
      payerEmail: receiptPayload.payerEmail,
      status: "pending",
      attemptCount: nextAttemptCount,
      lastError: null,
      providerMessageId: null,
    });

    const pdfBase64 = await buildReceiptPdf(receiptPayload);
    const providerMessageId = await sendViaResend(receiptPayload, pdfBase64);

    await upsertDispatch(supabase, {
      entryId,
      receiptNo,
      payerEmail: receiptPayload.payerEmail,
      status: "sent",
      attemptCount: nextAttemptCount,
      lastError: null,
      providerMessageId,
    });

    return { status: "sent", message: `Email sent to ${receiptPayload.payerEmail}` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await upsertDispatch(supabase, {
      entryId,
      receiptNo,
      payerEmail: receiptPayload?.payerEmail ?? existing?.payer_email ?? null,
      status: "failed",
      attemptCount: nextAttemptCount,
      lastError: errorMessage,
      providerMessageId: null,
    });

    throw error;
  }
}
