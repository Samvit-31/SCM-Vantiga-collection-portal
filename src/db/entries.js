import { supabase } from "../supabaseClient";

export function getPrimaryMember(entry) {
  return entry?.families?.family_members?.find(m => m.is_primary_payer);
}

export function getTotalAmount(entry) {
  const members = entry?.families?.family_members || [];
  return members.reduce((sum, m) => sum + Number(m.amount || 0), 0);
}

export async function fetchEntriesForSabhaFY({ sabhaId, fy, submittedBy }) {
  let query = supabase
    .from("vantiga_entries")
    .select(`
      id, fy, status, paid_by, reference_no, receipt_no, submitted_by,
      submitted_at, acknowledged_at, rejection_reason,
      families (
        id,
        address_multiline,
        payer_mobile,
        payer_email,
        opt_show_amount_in_directory,
        opt_show_mobile_in_directory,
        opt_show_email_in_directory,
        family_members (
          id, full_name, age, gender, gotra, amount, is_primary_payer
        )
      )
    `)
    .eq("sabha_id", sabhaId)
    .eq("fy", fy);

  if (submittedBy) {
    query = query.eq("submitted_by", submittedBy);
  }

  const { data, error } = await query.order("submitted_at", { ascending: false });

  if (error) {
    console.error("Error fetching entries", error);
    throw error;
  }

  return data || [];
}
