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
  age: number | null;
  gender: string | null;
  gotra: string | null;
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
  submittedBy: string | null;
  acknowledgedBy: string | null;
  payerEmail: string;
  payerMobile: string | null;
  payerName: string;
  address: string | null;
  sabhaName: string;
  sabhaCode: string | null;
  optShowAmountInDirectory: "Yes" | "No";
  optShowMobileInDirectory: "Yes" | "No";
  optShowEmailInDirectory: "Yes" | "No";
  pratinidhiName: string;
  treasurerName: string;
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

function formatAmountIndian(value: number): string {
  try {
    return value.toLocaleString("en-IN");
  } catch {
    return value.toFixed(2);
  }
}

function numberToWords(num: number): string {
  if (!num || num === 0) return "Zero";

  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];

  const ltThousand = (n: number): string => {
    if (n === 0) return "";
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) {
      const t = Math.floor(n / 10);
      const o = n % 10;
      return tens[t] + (o ? ` ${ones[o]}` : "");
    }
    const h = Math.floor(n / 100);
    const r = n % 100;
    return `${ones[h]} Hundred${r ? ` ${ltThousand(r)}` : ""}`;
  };

  if (num < 1000) return ltThousand(num);
  if (num < 100000) {
    const th = Math.floor(num / 1000);
    const r = num % 1000;
    return `${ltThousand(th)} Thousand${r ? ` ${ltThousand(r)}` : ""}`;
  }
  if (num < 10000000) {
    const l = Math.floor(num / 100000);
    const r = num % 100000;
    return `${ltThousand(l)} Lakh${r ? ` ${numberToWords(r)}` : ""}`;
  }
  const c = Math.floor(num / 10000000);
  const r = num % 10000000;
  return `${ltThousand(c)} Crore${r ? ` ${numberToWords(r)}` : ""}`;
}

function yesNo(value: boolean | null | undefined): "Yes" | "No" {
  return value ? "Yes" : "No";
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
      submitted_by,
      acknowledged_by,
      receipt_no,
      sabhas:sabha_id (
        name,
        code
      ),
      families:family_id (
        payer_email,
        payer_mobile,
        address_multiline,
        opt_show_amount_in_directory,
        opt_show_mobile_in_directory,
        opt_show_email_in_directory,
        family_members (
          full_name,
          age,
          gender,
          gotra,
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

  const submittedBy = optionalTrimmed(data?.submitted_by);
  const acknowledgedBy = optionalTrimmed(data?.acknowledged_by);

  let pratinidhiName = "-";
  let treasurerName = "-";

  if (submittedBy) {
    const { data: submittedByProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", submittedBy)
      .maybeSingle();
    pratinidhiName = optionalTrimmed(submittedByProfile?.full_name) || "-";
  }

  if (acknowledgedBy) {
    const { data: acknowledgedByProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", acknowledgedBy)
      .maybeSingle();
    treasurerName = optionalTrimmed(acknowledgedByProfile?.full_name) || "-";
  }

  return {
    entryId: data.id,
    receiptNo,
    fy: data?.fy || "-",
    paidBy: data?.paid_by || "-",
    referenceNo: optionalTrimmed(data?.reference_no),
    submittedAt: optionalTrimmed(data?.submitted_at),
    acknowledgedAt: optionalTrimmed(data?.acknowledged_at),
    submittedBy,
    acknowledgedBy,
    payerEmail,
    payerMobile: optionalTrimmed(family?.payer_mobile),
    payerName,
    address: optionalTrimmed(family?.address_multiline),
    sabhaName: optionalTrimmed(sabha?.name) || "-",
    sabhaCode: optionalTrimmed(sabha?.code),
    optShowAmountInDirectory: yesNo(family?.opt_show_amount_in_directory),
    optShowMobileInDirectory: yesNo(family?.opt_show_mobile_in_directory),
    optShowEmailInDirectory: yesNo(family?.opt_show_email_in_directory),
    pratinidhiName,
    treasurerName,
    totalAmount,
    members,
  };
}

export async function buildReceiptPdf(payload: ReceiptPayload): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pageWidth = page.getWidth();

  let y = 812;
  const left = 48;
  const right = pageWidth - 48;
  const lineGap = 14;
  const paidBy = payload.paidBy || "-";
  const referenceNo = payload.referenceNo || (paidBy === "Cash" ? "Not Applicable" : "-");
  const receiptDate = formatDate(payload.acknowledgedAt || payload.submittedAt);
  const amountInWords = numberToWords(Math.round(payload.totalAmount));

  page.drawText("Shri Chitrapur Math", {
    x: left,
    y,
    size: 17,
    font: titleFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= lineGap;
  page.drawText("Chitrapur, Shirali, Uttara Kannada Dist. Karnataka - 581354", {
    x: left,
    y,
    size: 9,
    font: bodyFont,
  });
  y -= lineGap - 2;
  page.drawText("Email: accts.shirali@chitrapurmath.in    GSTN: 29AAATS5030Q1Z0", {
    x: left,
    y,
    size: 9,
    font: bodyFont,
  });

  y -= lineGap + 2;
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 1,
    color: rgb(0.75, 0.75, 0.75),
  });

  y -= lineGap + 2;
  page.drawText("Digital Vantiga Receipt", {
    x: left,
    y,
    size: 13,
    font: titleFont,
  });
  y -= lineGap;
  page.drawText(`Collecting Local Sabha: ${payload.sabhaName}`, {
    x: left,
    y,
    size: 10,
    font: titleFont,
  });

  page.drawText(`Receipt number: ${payload.receiptNo}`, {
    x: right - 220,
    y,
    size: 10,
    font: bodyFont,
  });
  y -= lineGap;
  page.drawText(`Date: ${receiptDate}`, { x: right - 220, y, size: 10, font: bodyFont });

  y -= lineGap;
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 1,
    color: rgb(0.75, 0.75, 0.75),
  });

  y -= lineGap + 1;
  page.drawText(`Received From: ${payload.payerName} for the purpose of Vantiga for Year: ${payload.fy}`, {
    x: left,
    y,
    size: 10,
    font: bodyFont,
  });

  y -= lineGap;
  page.drawText(`Address: ${payload.address || "-"}`, { x: left, y, size: 9.5, font: bodyFont });
  y -= lineGap;
  page.drawText(`Mobile Number: ${payload.payerMobile ? `+91 ${payload.payerMobile}` : "-"}`, {
    x: left,
    y,
    size: 9.5,
    font: bodyFont,
  });
  page.drawText(`Email ID: ${payload.payerEmail}`, {
    x: right - 220,
    y,
    size: 9.5,
    font: bodyFont,
  });

  y -= lineGap;
  page.drawText("Vantiga Payer Details:", {
    x: left,
    y,
    size: 10.5,
    font: titleFont,
  });

  y -= lineGap;
  page.drawText("Name", { x: left + 2, y, size: 9, font: titleFont });
  page.drawText("Age", { x: left + 210, y, size: 9, font: titleFont });
  page.drawText("Gender", { x: left + 245, y, size: 9, font: titleFont });
  page.drawText("Gotra", { x: left + 300, y, size: 9, font: titleFont });
  page.drawText("Amount", { x: right - 60, y, size: 9, font: titleFont });

  y -= 4;
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 1,
    color: rgb(0.75, 0.75, 0.75),
  });

  const rowCount = Math.max(5, payload.members.length);
  for (let i = 0; i < rowCount; i += 1) {
    const member = payload.members[i];
    y -= 12;
    if (y < 110) break;

    page.drawText(member?.full_name || "", { x: left + 2, y, size: 9, font: bodyFont });
    page.drawText(member?.age != null ? String(member.age) : "", { x: left + 210, y, size: 9, font: bodyFont });
    page.drawText(member?.gender || "", { x: left + 245, y, size: 9, font: bodyFont });
    page.drawText(member?.gotra || "", { x: left + 300, y, size: 9, font: bodyFont });
    page.drawText(member ? formatAmountIndian(Number(member.amount || 0)) : "", {
      x: right - 60,
      y,
      size: 9,
      font: bodyFont,
    });
  }

  y -= 12;
  page.drawLine({
    start: { x: left, y: y + 10 },
    end: { x: right, y: y + 10 },
    thickness: 1,
    color: rgb(0.75, 0.75, 0.75),
  });

  page.drawText("TOTAL", {
    x: right - 140,
    y,
    size: 9,
    font: titleFont,
  });
  page.drawText(formatAmountIndian(payload.totalAmount), {
    x: right - 60,
    y,
    size: 9,
    font: titleFont,
  });

  y -= lineGap;
  page.drawText(`AMOUNT IN WORDS: Rupees ${amountInWords} Only`, {
    x: left,
    y,
    size: 9.5,
    font: titleFont,
  });

  y -= lineGap + 1;
  page.drawText(`Payment Mode: ${paidBy}`, {
    x: left,
    y,
    size: 9.5,
    font: bodyFont,
  });
  y -= lineGap;
  page.drawText(`Reference Number: ${referenceNo}`, { x: left, y, size: 9.5, font: bodyFont });

  y -= lineGap + 2;
  page.drawText("Opt to Show in Vantiga Directory:", {
    x: left,
    y,
    size: 9.5,
    font: titleFont,
  });
  y -= lineGap;
  page.drawText(`Vantiga Amount: ${payload.optShowAmountInDirectory}`, { x: left, y, size: 9, font: bodyFont });
  page.drawText(`Mobile Number: ${payload.optShowMobileInDirectory}`, { x: left + 170, y, size: 9, font: bodyFont });
  page.drawText(`Email ID: ${payload.optShowEmailInDirectory}`, { x: left + 340, y, size: 9, font: bodyFont });

  y -= lineGap + 4;
  page.drawText("Pratinidhi Name:", { x: left, y, size: 9.5, font: titleFont });
  page.drawText(payload.pratinidhiName, { x: left + 90, y, size: 9.5, font: bodyFont });
  page.drawText("Treasurer Name:", { x: left + 280, y, size: 9.5, font: titleFont });
  page.drawText(payload.treasurerName, { x: left + 370, y, size: 9.5, font: bodyFont });

  y -= lineGap + 2;
  page.drawText("No Signature required as this is a computer generated receipt", {
    x: left,
    y,
    size: 8.5,
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
      <strong>Total Amount:</strong> INR ${formatAmountIndian(payload.totalAmount)}</p>
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
