import React, { useCallback, useEffect, useMemo, useState } from "react";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import Button from "../../../components/ui/Button";
import Icon from "../../../components/AppIcon";
import { supabase } from "../../../supabaseClient";

const REMITTANCE_MODES = [
  { value: "CASH", label: "Cash" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "NEFT/RTGS/IMPS", label: "NEFT/RTGS/IMPS" },
  { value: "UPI", label: "UPI" },
];

const STATUS_STYLES = {
  SUBMITTED: "bg-blue-100 text-blue-700 border-blue-200",
  VERIFIED: "bg-green-100 text-green-700 border-green-200",
  REJECTED: "bg-red-100 text-red-700 border-red-200"
};

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

const TreasurerRemittancesTab = ({ selectedFY, userProfile }) => {
  const [remittances, setRemittances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const [formData, setFormData] = useState({
    remittedAt: getTodayInputValue(),
    remittedAmount: "",
    remittanceMode: "",
    referenceNo: "",
    bankName: "",
    remarks: ""
  });

  const sabhaId = userProfile?.sabhaId;

  const fetchRemittances = useCallback(async () => {
    if (!sabhaId || !selectedFY) return;

    setLoading(true);
    setLoadError(null);

    try {
      const { data, error } = await supabase
        .from("sabha_remittances")
        .select(`
          id, sabha_id, fy, remitted_amount, remitted_at, remittance_mode,
          reference_no, bank_name, remarks, status, verified_at, rejection_reason
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

  useEffect(() => {
    fetchRemittances();
  }, [fetchRemittances]);

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
    const rows = remittances || [];
    const totalRemitted = rows
      .filter((r) => r?.status !== "REJECTED")
      .reduce((sum, r) => sum + Number(r?.remitted_amount || 0), 0);
    const totalCount = rows.length;
    const pendingCount = rows.filter((r) => r?.status === "SUBMITTED").length;
    const verifiedCount = rows.filter((r) => r?.status === "VERIFIED").length;

    return {
      totalRemitted,
      totalCount,
      pendingCount,
      verifiedCount
    };
  }, [remittances]);

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors?.[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: "" }));
    }
    if (formError) setFormError("");
  };

  const validateForm = () => {
    const nextErrors = {};
    const amountValue = Number(formData?.remittedAmount || 0);

    if (!amountValue || amountValue <= 0) {
      nextErrors.remittedAmount = "Amount must be greater than 0";
    }
    if (!formData?.remittanceMode) {
      nextErrors.remittanceMode = "Remittance mode is required";
    }
    if (!formData?.remittedAt) {
      nextErrors.remittedAt = "Remitted date is required";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event?.preventDefault();
    if (!validateForm()) return;
    if (!sabhaId) {
      setFormError("Sabha mapping missing. Please re-login.");
      return;
    }

    setIsSubmitting(true);
    setFormError("");

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const userId = userData?.user?.id;
      if (!userId) throw new Error("No active session. Please login again.");

      const remittedAtIso = new Date(`${formData.remittedAt}T00:00:00`).toISOString();
      const remittedAmount = Number(formData?.remittedAmount || 0);

      const payload = {
        sabha_id: sabhaId,
        fy: selectedFY,
        remitted_amount: remittedAmount,
        remitted_at: remittedAtIso,
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
    } catch (err) {
      console.error("Failed to submit remittance", err);
      setFormError(err?.message || "Failed to submit remittance");
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Icon name="IndianRupee" size={22} color="#3b82f6" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Remitted (FY)</h3>
          <p className="text-2xl font-bold text-card-foreground">{formatAmount(kpis.totalRemitted)}</p>
        </div>

        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-slate-500/10 rounded-lg">
              <Icon name="List" size={22} color="#64748b" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Remittances Count</h3>
          <p className="text-2xl font-bold text-card-foreground">{kpis.totalCount}</p>
        </div>

        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Icon name="Clock" size={22} color="#f59e0b" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Pending Verification</h3>
          <p className="text-2xl font-bold text-card-foreground">{kpis.pendingCount}</p>
        </div>

        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Icon name="CheckCircle2" size={22} color="#22c55e" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Verified Count</h3>
          <p className="text-2xl font-bold text-card-foreground">{kpis.verifiedCount}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Create New Remittance</h3>
            <p className="text-xs text-muted-foreground">Submit remittance details for FY {selectedFY}</p>
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
              label="Remittance Mode"
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
              placeholder="Optional reference"
              value={formData.referenceNo}
              onChange={(e) => handleFieldChange("referenceNo", e?.target?.value)}
              disabled={isSubmitting}
            />
            <Input
              label="Bank Name"
              placeholder="Optional bank name"
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

          {formError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end">
            <Button
              type="submit"
              variant="default"
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
            <h3 className="text-lg font-semibold text-foreground">Remittances</h3>
            <p className="text-xs text-muted-foreground">FY {selectedFY}</p>
          </div>
          <button
            className="text-xs text-primary hover:underline"
            onClick={fetchRemittances}
            type="button"
          >
            Refresh
          </button>
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
                    Reference
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium bg-[#F97316] text-white uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium bg-[#F97316] text-white uppercase tracking-wider">
                    Verified Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium bg-[#F97316] text-white uppercase tracking-wider">
                    Rejection Reason
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {remittances.map((row) => (
                  <tr key={row?.id} className="hover:bg-muted/30 transition-colors duration-150">
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
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          STATUS_STYLES[row?.status] || "bg-gray-100 text-gray-700 border-gray-200"
                        }`}
                      >
                        {row?.status || "UNKNOWN"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                      {row?.verified_at ? formatDate(row?.verified_at) : "-"}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {row?.status === "REJECTED" ? row?.rejection_reason || "-" : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : !loading ? (
            <div className="px-6 py-12 text-center">
              <Icon name="FileX" size={48} className="mx-auto text-muted-foreground mb-3" />
              <h3 className="text-lg font-medium text-foreground mb-1">No remittances found</h3>
              <p className="text-sm text-muted-foreground">
                No remittances recorded for FY {selectedFY}.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default TreasurerRemittancesTab;
