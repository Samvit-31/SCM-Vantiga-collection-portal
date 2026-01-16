import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import Button from "../../../components/ui/Button";
import Icon from "../../../components/AppIcon";
import { supabase } from "../../../supabaseClient";
import { getRemittanceStatusBadge } from "../../../utils/remittanceStatus.jsx";

const REMITTANCE_MODES = [
  { value: "NEFT", label: "NEFT" },
  { value: "RTGS", label: "RTGS" },
  { value: "IMPS", label: "IMPS" },
  { value: "UPI", label: "UPI" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CASH_DEPOSIT", label: "Cash Deposit" },
  { value: "ONLINE", label: "Online" }
];

const getTodayInputValue = () => new Date().toISOString().split("T")[0];

const formatDate = (dateString) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const formatAmount = (amount) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(amount || 0));
};

const RemittancesTab = ({ selectedFY, userProfile }) => {
  const sabhaId = userProfile?.sabhaId;
  const [remittances, setRemittances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [totalCollectedAck, setTotalCollectedAck] = useState(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const [formData, setFormData] = useState({
    remittedAt: getTodayInputValue(),
    remittedAmount: "",
    remittanceMode: "",
    referenceNo: "",
    bankName: "",
    remarks: ""
  });

  const fetchRemittances = useCallback(async () => {
    if (!sabhaId || !selectedFY) return;
    setLoading(true);
    setLoadError(null);

    try {
      const { data, error } = await supabase
        .from("sabha_remittances")
        .select(`
          id, sabha_id, fy, remitted_amount, remitted_at, remittance_mode,
          reference_no, status, verified_at, rejection_reason
        `)
        .eq("sabha_id", sabhaId)
        .eq("fy", selectedFY)
        .order("remitted_at", { ascending: false });

      if (error) throw error;
      setRemittances(data || []);
    } catch (err) {
      console.error("Failed to load remittances", err);
      setLoadError(err?.message || "Failed to load remittances");
      setRemittances([]);
    } finally {
      setLoading(false);
    }
  }, [sabhaId, selectedFY]);

  const fetchCollectedTotal = useCallback(async () => {
    if (!sabhaId || !selectedFY) return;

    try {
      const { data, error } = await supabase
        .from("vantiga_entries")
        .select(`
          sabha_id,
          status,
          families (
            family_members ( amount )
          )
        `)
        .eq("sabha_id", sabhaId)
        .eq("fy", selectedFY)
        .eq("status", "ACKNOWLEDGED");

      if (error) throw error;

      const total = (data || []).reduce((sum, entry) => {
        const members = entry?.families?.family_members || [];
        const entryTotal = members.reduce((mSum, m) => mSum + Number(m?.amount || 0), 0);
        return sum + entryTotal;
      }, 0);

      setTotalCollectedAck(total);
    } catch (err) {
      console.warn("Failed to load collected total", err);
      setTotalCollectedAck(0);
    }
  }, [sabhaId, selectedFY]);

  useEffect(() => {
    fetchRemittances();
  }, [fetchRemittances]);

  useEffect(() => {
    fetchCollectedTotal();
  }, [fetchCollectedTotal]);

  useEffect(() => {
    if (!sabhaId || !selectedFY) return;

    const channel = supabase.channel(`sabha_remittances_${sabhaId}`);
    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sabha_remittances",
          filter: `sabha_id=eq.${sabhaId}`
        },
        (payload) => {
          const newRow = payload?.new;
          const oldRow = payload?.old;
          const matchesFY =
            (newRow && newRow.fy === selectedFY) ||
            (oldRow && oldRow.fy === selectedFY);
          if (matchesFY) fetchRemittances();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sabhaId, selectedFY, fetchRemittances]);

  const kpis = useMemo(() => {
    const verifiedTotal = remittances
      .filter((row) => row?.status === "VERIFIED")
      .reduce((sum, row) => sum + Number(row?.remitted_amount || 0), 0);

    const pendingRows = remittances.filter((row) => row?.status === "SUBMITTED");
    const pendingTotal = pendingRows.reduce((sum, row) => sum + Number(row?.remitted_amount || 0), 0);

    return {
      verifiedTotal,
      pendingTotal,
      pendingCount: pendingRows.length,
      retained: totalCollectedAck - verifiedTotal
    };
  }, [remittances, totalCollectedAck]);

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors?.[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const validateForm = () => {
    const nextErrors = {};
    const amountValue = Number(formData?.remittedAmount || 0);

    if (!formData?.remittedAt) {
      nextErrors.remittedAt = "Date is required";
    }
    if (!amountValue || amountValue <= 0) {
      nextErrors.remittedAmount = "Amount must be greater than 0";
    }
    if (!formData?.remittanceMode) {
      nextErrors.remittanceMode = "Mode is required";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event?.preventDefault();
    if (!validateForm()) return;
    if (!sabhaId) {
      toast.error("Sabha mapping missing. Please re-login.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const userId = userData?.user?.id;
      if (!userId) throw new Error("No active session. Please login again.");

      const remittedAtIso = new Date(`${formData.remittedAt}T00:00:00`).toISOString();
      const payload = {
        sabha_id: sabhaId,
        fy: selectedFY,
        remitted_at: remittedAtIso,
        remitted_amount: Number(formData?.remittedAmount || 0),
        remittance_mode: formData.remittanceMode,
        reference_no: formData.referenceNo?.trim() || null,
        bank_name: formData.bankName?.trim() || null,
        remarks: formData.remarks?.trim() || null,
        status: "SUBMITTED",
        created_by: userId
      };

      const { error } = await supabase.from("sabha_remittances").insert(payload);
      if (error) throw error;

      setFormData({
        remittedAt: getTodayInputValue(),
        remittedAmount: "",
        remittanceMode: "",
        referenceNo: "",
        bankName: "",
        remarks: ""
      });
      setFieldErrors({});
      await fetchRemittances();
      toast.success("Remittance submitted for verification");
    } catch (err) {
      console.error("Failed to submit remittance", err);
      toast.error(err?.message || "Failed to submit remittance");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!sabhaId) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="text-sm text-muted-foreground">
          Sabha mapping is missing. Please re-login or contact support.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Icon name="IndianRupee" size={22} color="#3b82f6" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Collected (Acknowledged)</h3>
          <p className="text-2xl font-bold text-card-foreground">{formatAmount(totalCollectedAck)}</p>
        </div>

        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Icon name="CheckCircle2" size={22} color="#22c55e" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Remitted (Verified)</h3>
          <p className="text-2xl font-bold text-card-foreground">{formatAmount(kpis.verifiedTotal)}</p>
        </div>

        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Icon name="Clock" size={22} color="#f59e0b" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Pending Verification</h3>
          <p className="text-2xl font-bold text-card-foreground">{formatAmount(kpis.pendingTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {kpis.pendingCount} {kpis.pendingCount === 1 ? "remittance" : "remittances"}
          </p>
        </div>

        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-slate-500/10 rounded-lg">
              <Icon name="Wallet" size={22} color="#64748b" />
            </div>
          </div>
          <h3
            className="text-sm font-medium text-muted-foreground mb-1"
            title="Retained = Acknowledged collection - Verified remittances"
          >
            Retained with Sabha
          </h3>
          <p className="text-2xl font-bold text-card-foreground">{formatAmount(kpis.retained)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Retained = Acknowledged collection - Verified remittances
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Submit Remittance</h3>
            <p className="text-xs text-muted-foreground">Submit for FY {selectedFY}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              type="date"
              label="Remitted Date"
              value={formData.remittedAt}
              onChange={(e) => handleFieldChange("remittedAt", e?.target?.value)}
              error={fieldErrors.remittedAt}
              required
              disabled={isSubmitting}
            />
            <Input
              type="number"
              label="Amount"
              placeholder="Enter amount"
              value={formData.remittedAmount}
              onChange={(e) => handleFieldChange("remittedAmount", e?.target?.value)}
              error={fieldErrors.remittedAmount}
              required
              disabled={isSubmitting}
            />
            <Select
              label="Mode"
              value={formData.remittanceMode}
              onChange={(value) => handleFieldChange("remittanceMode", value)}
              options={REMITTANCE_MODES}
              error={fieldErrors.remittanceMode}
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Reference No"
              placeholder="Optional"
              value={formData.referenceNo}
              onChange={(e) => handleFieldChange("referenceNo", e?.target?.value)}
              disabled={isSubmitting}
            />
            <Input
              label="Bank Name"
              placeholder="Optional"
              value={formData.bankName}
              onChange={(e) => handleFieldChange("bankName", e?.target?.value)}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Remarks</label>
            <textarea
              value={formData.remarks}
              onChange={(e) => handleFieldChange("remarks", e?.target?.value)}
              rows={3}
              placeholder="Optional remarks"
              className="mt-2 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              disabled={isSubmitting}
            />
          </div>

          <div className="flex items-center justify-end">
            <Button
              type="submit"
              variant="outline"
              loading={isSubmitting}
              disabled={isSubmitting}
              className="bg-[#F97316] text-white"
            >
              Submit Remittance
            </Button>
          </div>
        </form>
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Remittance Ledger</h3>
            <p className="text-xs text-muted-foreground">FY {selectedFY}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading && (
            <div className="px-6 py-4 text-sm text-muted-foreground">
              Loading remittances...
            </div>
          )}

          {loadError && (
            <div className="px-6 py-4 text-sm text-red-600">
              Failed to load remittances: {String(loadError)}
            </div>
          )}

          {!loading && remittances?.length > 0 ? (
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium bg-[#F97316] text-white uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium bg-[#F97316] text-white uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium bg-[#F97316] text-white uppercase tracking-wider">
                    Mode
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium bg-[#F97316] text-white uppercase tracking-wider">
                    Ref No
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium bg-[#F97316] text-white uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium bg-[#F97316] text-white uppercase tracking-wider">
                    Verified On
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {remittances.map((row) => (
                  <React.Fragment key={row?.id}>
                    <tr className="hover:bg-muted/30 transition-colors duration-150">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                        {formatDate(row?.remitted_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-foreground">
                        {formatAmount(row?.remitted_amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                        {row?.remittance_mode || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {row?.reference_no || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {getRemittanceStatusBadge(row?.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                      {row?.verified_at ? formatDate(row?.verified_at) : "-"}
                      </td>
                    </tr>
                    {row?.status === "REJECTED" && (
                      <tr className="bg-red-50/40">
                        <td colSpan={6} className="px-6 py-3 text-sm text-red-700">
                          Rejection reason: {row?.rejection_reason || "No reason provided"}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          ) : !loading ? (
            <div className="px-6 py-12 text-center">
              <Icon name="FileX" size={48} className="mx-auto text-muted-foreground mb-3" />
              <h3 className="text-lg font-medium text-foreground mb-1">No remittances found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                No remittances recorded for FY {selectedFY}.
              </p>
            </div>
          ) : null}
        </div>
      </div>

    </div>
  );
};

export default RemittancesTab;
