import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../../../components/AppIcon";
import Button from "../../../components/ui/Button";
import Select from "../../../components/ui/Select";
import { supabase } from "../../../supabaseClient";

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ---------- Helpers ----------
const formatCurrency = (amount) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
};

const formatDate = (dateString) => {
  if (!dateString) return "-";
  const d = new Date(dateString);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Status" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "ACKNOWLEDGED", label: "Acknowledged" },
  { value: "REJECTED", label: "Rejected" },
];

// FY months Apr -> Mar
const FY_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const monthIndexToFYIndex = (monthIndex) => (monthIndex >= 3 ? monthIndex - 3 : monthIndex + 9);

const SummaryTab = ({ selectedFY }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // filters
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedSabhaIds, setSelectedSabhaIds] = useState([]); // multi sabha
  const [isSabhaOpen, setIsSabhaOpen] = useState(false);
  const sabhaRef = useRef(null);

  // Close sabha popover on outside click
  useEffect(() => {
    if (!isSabhaOpen) return;
    const onDown = (e) => {
      if (sabhaRef.current && !sabhaRef.current.contains(e.target)) setIsSabhaOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isSabhaOpen]);

  const loadSummaryEntries = useCallback(async () => {
    if (!selectedFY) return;

    setLoading(true);
    setLoadError(null);

    try {
      /**
       * Expected schema:
       * - vantiga_entries: id, fy, status, submitted_at, acknowledged_at, receipt_no, paid_by, sabha_id, family_id
       * - families: id
       * - family_members: id, full_name, age, gender, gotra, amount, is_primary_payer
       * - sabhas: id, name, code
       */
      const { data, error } = await supabase
        .from("vantiga_entries")
        .select(`
          id,
          fy,
          status,
          submitted_at,
          acknowledged_at,
          receipt_no,
          paid_by,
          sabha_id,
          families:family_id (
            id,
            family_members (
              id,
              full_name,
              age,
              gender,
              gotra,
              amount,
              is_primary_payer
            )
          ),
          sabhas:sabha_id (
            id,
            name,
            code
          )
        `)
        .eq("fy", selectedFY)
        .order("submitted_at", { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map((r) => {
        const members = r?.families?.family_members || [];
        const totalAmount = members.reduce((sum, m) => sum + (Number(m?.amount) || 0), 0);

        const payerName =
          members.find((m) => m?.is_primary_payer)?.full_name ||
          members?.[0]?.full_name ||
          "Unknown";

        return {
          entryId: r.id,
          fy: r.fy,
          status: r.status,
          submitted_at: r.submitted_at,
          acknowledged_at: r.acknowledged_at,
          paid_by: r.paid_by || "",
          receipt_no: r.receipt_no || null,
          sabha_id: r.sabha_id,
          sabha_name: r?.sabhas?.name || "—",
          sabha_code: r?.sabhas?.code || "",
          payerName,
          totalAmount,
          members,
        };
      });

      setEntries(mapped);
    } catch (e) {
      console.error(e);
      setLoadError(e?.message || String(e));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [selectedFY]);

  useEffect(() => {
    loadSummaryEntries();
  }, [loadSummaryEntries]);

  // Realtime refresh for FY
  useEffect(() => {
    if (!selectedFY) return;

    const channel = supabase.channel(`scm_office_summary_${selectedFY}`);
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "vantiga_entries" }, (payload) => {
        const newRow = payload?.new;
        const oldRow = payload?.old;
        const matchesFY =
          (newRow && newRow.fy === selectedFY) || (oldRow && oldRow.fy === selectedFY);
        if (matchesFY) loadSummaryEntries();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedFY, loadSummaryEntries]);

  // Sabha list (from data)
  const sabhaOptions = useMemo(() => {
    const m = new Map();
    entries.forEach((e) => {
      if (e?.sabha_id) m.set(e.sabha_id, e.sabha_name || "—");
    });
    return Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  // Initialize selectedSabhaIds to "all" (i.e., empty => all) OR keep selection if still valid
  useEffect(() => {
    // If you want default to ALL sabhas, keep selectedSabhaIds empty.
    // But ensure the selection doesn't contain sabhas that no longer exist in options:
    if (!sabhaOptions.length) return;
    setSelectedSabhaIds((prev) => prev.filter((id) => sabhaOptions.some((s) => s.id === id)));
  }, [sabhaOptions]);

  const isAllSabhasSelected = selectedSabhaIds.length === 0; // empty means "All Sabhas"
  const sabhaLabel = useMemo(() => {
    if (isAllSabhasSelected) return "All Sabhas";
    const names = sabhaOptions
      .filter((s) => selectedSabhaIds.includes(s.id))
      .map((s) => s.name);
    if (names.length <= 2) return names.join(", ");
    return `${names.length} Sabhas selected`;
  }, [isAllSabhasSelected, sabhaOptions, selectedSabhaIds]);

  const toggleSabha = (id) => {
    setSelectedSabhaIds((prev) => {
      // special: if "All" semantics currently (empty), start from [] and add id
      if (prev.length === 0) return [id];
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        // if user unchecks last sabha => go back to all sabhas (empty)
        return next.length ? next : [];
      }
      return [...prev, id];
    });
  };

  const selectAllSabhas = () => setSelectedSabhaIds([]);
  const selectOnlySabha = (id) => setSelectedSabhaIds([id]);

  // Apply filters
  const filteredEntries = useMemo(() => {
    let list = [...entries];

    if (!isAllSabhasSelected) {
      list = list.filter((e) => selectedSabhaIds.includes(e.sabha_id));
    }

    if (statusFilter !== "ALL") {
      list = list.filter((e) => e.status === statusFilter);
    }

    return list;
  }, [entries, isAllSabhasSelected, selectedSabhaIds, statusFilter]);

  // --- KPIs (based on filtered entries) ---
  const kpis = useMemo(() => {
    const submitted = filteredEntries.filter((e) => e.status === "SUBMITTED");
    const acknowledged = filteredEntries.filter((e) => e.status === "ACKNOWLEDGED");
    const rejected = filteredEntries.filter((e) => e.status === "REJECTED");

    const totalMembersSubmitted = submitted.reduce((sum, e) => sum + (e?.members?.length || 0), 0);
    const totalMembersAcknowledged = acknowledged.reduce((sum, e) => sum + (e?.members?.length || 0), 0);
    const totalMembersRejected = rejected.reduce((sum, e) => sum + (e?.members?.length || 0), 0);

    const totalCollected = acknowledged.reduce((sum, e) => sum + (Number(e.totalAmount) || 0), 0);

    const totalEntries = filteredEntries.length;
    const ackRate = totalEntries > 0 ? ((acknowledged.length / totalEntries) * 100).toFixed(1) : "0.0";

    return {
      submittedCount: submitted.length,
      acknowledgedCount: acknowledged.length,
      rejectedCount: rejected.length,
      submittedMembers: totalMembersSubmitted,
      acknowledgedMembers: totalMembersAcknowledged,
      rejectedMembers: totalMembersRejected,
      totalCollected,
      ackRate,
    };
  }, [filteredEntries]);

  // --- Demographics (age distribution) ---
  const demographicsData = useMemo(() => {
    // Rule:
    // - If statusFilter === ALL => default demographics over ACKNOWLEDGED entries only (best signal)
    // - Else => use the chosen status entries
    const base =
      statusFilter === "ALL"
        ? filteredEntries.filter((e) => e.status === "ACKNOWLEDGED")
        : filteredEntries;

    const ageGroups = { "18-35": 0, "36-60": 0, "61+": 0 };

    base.forEach((entry) => {
      (entry?.members || []).forEach((m) => {
        const age = Number(m?.age || 0);
        if (age >= 18 && age <= 35) ageGroups["18-35"] += 1;
        else if (age >= 36 && age <= 60) ageGroups["36-60"] += 1;
        else if (age >= 61) ageGroups["61+"] += 1;
      });
    });

    const total = ageGroups["18-35"] + ageGroups["36-60"] + ageGroups["61+"];

    const out = [
      { name: "18-35 years", value: ageGroups["18-35"], percentage: 0 },
      { name: "36-60 years", value: ageGroups["36-60"], percentage: 0 },
      { name: "61+ years", value: ageGroups["61+"], percentage: 0 },
    ].map((item) => ({
      ...item,
      percentage: total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0",
    }));

    return out;
  }, [filteredEntries, statusFilter]);

  // --- Monthly trend (Apr->Mar) ---
  const monthlyTrendData = useMemo(() => {
    const months = FY_MONTHS.map((m) => ({ month: m, amount: 0 }));

    filteredEntries.forEach((entry) => {
      // Date rule: use acknowledged_at if present else submitted_at
      const date = new Date(entry?.acknowledged_at || entry?.submitted_at);
      const idx = monthIndexToFYIndex(date.getMonth());
      months[idx].amount += Number(entry?.totalAmount || 0);
    });

    return months;
  }, [filteredEntries]);

  // --- Payment mode distribution (amount-based) ---
  const paymentModeData = useMemo(() => {
    const modes = { Cash: 0, Cheque: 0, "NEFT/RTGS/IMPS": 0, UPI: 0, Other: 0 };

    filteredEntries.forEach((entry) => {
      const amt = Number(entry?.totalAmount || 0);
      const mode = entry?.paid_by;

      if (mode === "Cash") modes.Cash += amt;
      else if (mode === "Cheque") modes.Cheque += amt;
      else if (mode === "NEFT" || mode === "Online" || mode === "RTGS" || mode === "IMPS")
        modes["NEFT/RTGS/IMPS"] += amt;
      else if (mode === "UPI") modes.UPI += amt;
      else modes.Other += amt;
    });

    return Object.entries(modes)
      .map(([name, value]) => ({ name, value }))
      .filter((x) => x.value > 0);
  }, [filteredEntries]);

  const kpiCards = useMemo(() => {
    return [
      {
        id: 1,
        title: "Submitted Entries",
        value: kpis.submittedCount,
        sub: `Members: ${kpis.submittedMembers}`,
        icon: "Send",
        color: "#3b82f6",
        bg: "bg-blue-500/10",
      },
      {
        id: 2,
        title: "Acknowledged Entries",
        value: kpis.acknowledgedCount,
        sub: `Members: ${kpis.acknowledgedMembers}`,
        icon: "CheckCircle2",
        color: "#22c55e",
        bg: "bg-green-500/10",
      },
      {
        id: 3,
        title: "Rejected Entries",
        value: kpis.rejectedCount,
        sub: `Members: ${kpis.rejectedMembers}`,
        icon: "XCircle",
        color: "#ef4444",
        bg: "bg-red-500/10",
      },
      {
        id: 4,
        title: "Total Collected (Ack)",
        value: formatCurrency(kpis.totalCollected),
        sub: `Ack rate: ${kpis.ackRate}%`,
        icon: "IndianRupee",
        color: "#a855f7",
        bg: "bg-purple-500/10",
        isCurrency: true,
      },
    ];
  }, [kpis]);

  const emptyState = !loading && filteredEntries.length === 0;

  return (
    <div className="space-y-6">
      {/* Header + Filters */}
      <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-card-foreground">
              Summary (All Sabhas)-FY {selectedFY}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Bird’s eye view across sabhas with filterable KPIs and charts
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Multi-sabha filter */}
            <div className="relative" ref={sabhaRef}>
              <button
                onClick={() => setIsSabhaOpen((p) => !p)}
                className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border bg-background hover:bg-muted/30 text-sm min-w-[220px]"
                type="button"
              >
                <span className="flex items-center gap-2">
                  <Icon name="MapPin" size={16} />
                  <span className="truncate">{sabhaLabel}</span>
                </span>
                <Icon name={isSabhaOpen ? "ChevronUp" : "ChevronDown"} size={16} />
              </button>

              {isSabhaOpen && (
                <div className="absolute right-0 mt-2 w-[320px] bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden">
                  <div className="p-3 border-b border-border flex items-center justify-between">
                    <div className="text-sm font-semibold text-foreground">Filter Sabhas</div>
                    <button
                      className="text-xs text-primary hover:underline"
                      type="button"
                      onClick={selectAllSabhas}
                    >
                      Select All
                    </button>
                  </div>

                  <div className="max-h-[320px] overflow-auto p-2">
                    {sabhaOptions.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">No sabhas found for this FY</div>
                    ) : (
                      sabhaOptions.map((s) => {
                        const checked = isAllSabhasSelected ? false : selectedSabhaIds.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className="flex items-center justify-between gap-3 px-2 py-2 rounded hover:bg-muted/40 cursor-pointer"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSabha(s.id)}
                              />
                              <span className="text-sm text-foreground truncate">{s.name}</span>
                            </div>

                            <button
                              className="text-xs text-muted-foreground hover:text-foreground"
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                selectOnlySabha(s.id);
                              }}
                              title="Only this sabha"
                            >
                              Only
                            </button>
                          </label>
                        );
                      })
                    )}
                  </div>

                  <div className="p-2 border-t border-border flex justify-end">
                    <Button variant="outline" onClick={() => setIsSabhaOpen(false)}>
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Status filter */}
            <div className="min-w-[180px]">
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                options={STATUS_OPTIONS}
                placeholder="Filter by Status"
              />
            </div>

            <Button variant="outline" onClick={loadSummaryEntries} iconName="RefreshCw" iconPosition="left">
              Refresh
            </Button>
          </div>
        </div>

        {/* Small note */}
        <div className="mt-3 text-xs text-muted-foreground">
          {loading
            ? "Loading…"
            : `Showing ${filteredEntries.length} of ${entries.length} entries (filters applied)`}
        </div>

        {loadError && (
          <div className="mt-3 bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
            Failed to load summary: {loadError}
          </div>
        )}
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((k) => (
          <div key={k.id} className="bg-card rounded-lg border border-border p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className={`p-2 ${k.bg} rounded-lg`}>
                <Icon name={k.icon} size={22} color={k.color} />
              </div>
            </div>
            <div className="text-sm font-medium text-muted-foreground">{k.title}</div>
            <div className="mt-1 text-2xl font-bold text-card-foreground">{k.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Demographics */}
        <div className="bg-card rounded-lg border border-border shadow-sm p-6">
          <h3 className="text-lg font-semibold text-card-foreground mb-2 flex items-center gap-2">
            <Icon name="Users" size={20} />
            Demographics of Payers
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Age distribution{" "}
            {statusFilter === "ALL" ? "(defaults to acknowledged entries)" : "(based on selected status)"}
          </p>

          {demographicsData.some((d) => d.value > 0) ? (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={demographicsData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percentage }) => `${name}: ${percentage}%`}
                    outerRadius={85}
                    dataKey="value"
                  >
                    {demographicsData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>

              <div className="mt-4 space-y-2">
                {demographicsData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-foreground">{item.name}</span>
                    </div>
                    <span className="font-semibold text-foreground">
                      {item.value} ({item.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Icon name="PieChart" size={48} className="mb-3" />
              <p className="text-sm">No data available for the selected filters</p>
            </div>
          )}
        </div>

        {/* Monthly Trend */}
        <div className="bg-card rounded-lg border border-border shadow-sm p-6">
          <h3 className="text-lg font-semibold text-card-foreground mb-2 flex items-center gap-2">
            <Icon name="TrendingUp" size={20} />
            Month-wise Trend
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Total amount by month (uses acknowledged date if present, else submitted date)
          </p>

          {monthlyTrendData.some((d) => d.amount > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="amount" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Icon name="BarChart2" size={48} className="mb-3" />
              <p className="text-sm">No data available for the selected filters</p>
            </div>
          )}
        </div>
      </div>

      {/* Payment Mode Distribution */}
      <div className="bg-card rounded-lg border border-border shadow-sm p-6">
        <h3 className="text-lg font-semibold text-card-foreground mb-2 flex items-center gap-2">
          <Icon name="CreditCard" size={20} />
          Mode of Payment Distribution
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Amount distribution by payment mode (based on filtered entries)
        </p>

        {paymentModeData.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={paymentModeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                  outerRadius={105}
                  dataKey="value"
                >
                  {paymentModeData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>

            <div className="flex flex-col justify-center space-y-3">
              {paymentModeData.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="font-medium text-foreground">{item.name}</span>
                  </div>
                  <span className="font-bold text-foreground">{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Icon name="PieChart" size={48} className="mb-3" />
            <p className="text-sm">No data available for the selected filters</p>
          </div>
        )}
      </div>

      {/* Empty state note */}
      {emptyState && (
        <div className="bg-muted/30 border border-border rounded-lg p-6 text-center">
          <Icon name="Info" size={44} className="mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium text-foreground mb-2">No Data Available</h3>
          <p className="text-sm text-muted-foreground">
            No entries found for FY {selectedFY} with the selected filters.
          </p>
        </div>
      )}
    </div>
  );
};

export default SummaryTab;
