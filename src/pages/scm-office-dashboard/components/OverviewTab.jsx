import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Icon from '../../../components/AppIcon';
import { supabase } from '../../../supabaseClient';

const OverviewTab = ({ selectedFY }) => {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const exportRef = useRef(null);

  const [rows, setRows] = useState([]); // raw rows (mapped minimal)
  const [metrics, setMetrics] = useState({
    totalSabhas: 0,
    totalEntries: 0,
    totalMembers: 0,
    totalVantigaCollected: 0, // ✅ acknowledged amount only
    pendingEntries: 0,        // ✅ SUBMITTED
    acknowledgedEntries: 0    // ✅ ACKNOWLEDGED
  });

  const [topPerformingSabhas, setTopPerformingSabhas] = useState([]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0
    })?.format(Number(amount || 0));
  };

  const escapeHtml = (value) => {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const openPrintWindow = (title, bodyHtml) => {
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) return;

    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 16mm; }
      body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      p { margin: 0 0 16px; color: #475569; font-size: 12px; }
      .kpi-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; }
      .label { font-size: 12px; color: #64748b; margin-bottom: 6px; }
      .value { font-size: 20px; font-weight: 700; }
      .sub { font-size: 11px; color: #64748b; margin-top: 6px; }
    </style>
  </head>
  <body>
    ${bodyHtml}
  </body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.print();
      printWindow.onafterprint = () => printWindow.close();
    };
  };

  const handleExportPdf = () => {
    setIsExportOpen(false);

    const cards = [
      { label: 'Total Sabhas', value: loading ? '-' : metrics.totalSabhas },
      {
        label: 'Total Vantiga Amount Collected (Ack)',
        value: loading ? '-' : formatCurrency(metrics.totalVantigaCollected)
      },
      { label: 'Entries Acknowledged', value: loading ? '-' : metrics.acknowledgedEntries }
    ];

    const cardsHtml = cards.map((card) => `
      <div class="card">
        <div class="label">${escapeHtml(card.label)}</div>
        <div class="value">${escapeHtml(card.value)}</div>
        ${card.sub ? `<div class="sub">${escapeHtml(card.sub)}</div>` : ''}
      </div>
    `).join('');

    const bodyHtml = `
      <h1>Vanitga Payment Overview - FY ${escapeHtml(selectedFY)}</h1>
      <p>Exported KPI snapshot</p>
      <div class="kpi-grid">
        ${cardsHtml}
      </div>
    `;

    openPrintWindow(`Vanitga Payment Overview - FY ${selectedFY}`, bodyHtml);
  };

  const loadOverview = useCallback(async () => {
    if (!selectedFY) return;

    setLoading(true);
    setLoadError(null);

    try {
      /**
       * Pull all entries for FY, with sabha + members to compute:
       * - sabha-wise totals
       * - total members
       * - totals for acknowledged vs submitted
       */
      const { data, error } = await supabase
        .from('vantiga_entries')
        .select(`
          id,
          fy,
          status,
          submitted_at,
          acknowledged_at,
          receipt_no,
          sabha_id,
          sabhas:sabha_id (
            id,
            name,
            code
          ),
          families:family_id (
            id,
            family_members (
              id,
              amount
            )
          )
        `)
        .eq('fy', selectedFY);

      if (error) throw error;

      const mapped = (data || []).map((r) => {
        const members = r?.families?.family_members || [];
        const membersCount = members.length;
        const amount = members.reduce((sum, m) => sum + (Number(m?.amount) || 0), 0);

        return {
          entryId: r.id,
          status: r.status,
          sabhaId: r.sabha_id,
          sabhaName: r?.sabhas?.name || '—',
          sabhaCode: r?.sabhas?.code || '',
          membersCount,
          amount
        };
      });

      setRows(mapped);
    } catch (e) {
      console.error(e);
      setLoadError(e?.message || String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedFY]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // ✅ Realtime refresh when entries change
  useEffect(() => {
    if (!selectedFY) return;

    const channel = supabase.channel(`scm_office_overview_${selectedFY}`);

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vantiga_entries' },
        (payload) => {
          const newRow = payload?.new;
          const oldRow = payload?.old;

          const matchesFY =
            (newRow && newRow.fy === selectedFY) ||
            (oldRow && oldRow.fy === selectedFY);

          if (matchesFY) loadOverview();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedFY, loadOverview]);

  useEffect(() => {
    if (!isExportOpen) return;
    const handleClickOutside = (event) => {
      if (exportRef?.current && !exportRef.current.contains(event?.target)) {
        setIsExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExportOpen]);

  // ✅ Compute org-level metrics + top sabhas
  useEffect(() => {
    const totalEntries = rows.length;
    const acknowledgedEntries = rows.filter(r => r.status === 'ACKNOWLEDGED');
    const pendingEntries = rows.filter(r => r.status === 'SUBMITTED');

    const totalMembers = rows.reduce((sum, r) => sum + (r.membersCount || 0), 0);

    // Only acknowledged amount counted as "collected"
    const totalVantigaCollected = acknowledgedEntries.reduce((sum, r) => sum + (r.amount || 0), 0);

    const sabhaMap = new Map();
    rows.forEach((r) => {
      const key = r.sabhaId || r.sabhaName || '—';
      if (!sabhaMap.has(key)) {
        sabhaMap.set(key, {
          sabhaId: r.sabhaId || null,
          name: r.sabhaName || '—',
          entries: 0,
          acknowledgedEntries: 0,
          pendingEntries: 0,
          members: 0,
          amountAcknowledged: 0
        });
      }
      const s = sabhaMap.get(key);
      s.entries += 1;
      s.members += (r.membersCount || 0);

      if (r.status === 'ACKNOWLEDGED') {
        s.acknowledgedEntries += 1;
        s.amountAcknowledged += (r.amount || 0);
      } else if (r.status === 'SUBMITTED') {
        s.pendingEntries += 1;
      }
    });

    const sabhaList = Array.from(sabhaMap.values());
    const totalSabhas = sabhaList.length;

    // Top performing: by acknowledged amount (desc), then acknowledged entries
    const top = sabhaList
      .sort((a, b) => (b.amountAcknowledged - a.amountAcknowledged) || (b.acknowledgedEntries - a.acknowledgedEntries))
      .slice(0, 5);

    setMetrics({
      totalSabhas,
      totalEntries,
      totalMembers,
      totalVantigaCollected,
      pendingEntries: pendingEntries.length,
      acknowledgedEntries: acknowledgedEntries.length
    });

    setTopPerformingSabhas(top);
  }, [rows]);

  const avgMembersPerEntry = useMemo(() => {
    const denom = metrics.totalEntries || 1;
    return (metrics.totalMembers / denom).toFixed(1);
  }, [metrics.totalMembers, metrics.totalEntries]);

  const acknowledgementRate = useMemo(() => {
    const denom = metrics.totalEntries || 1;
    return ((metrics.acknowledgedEntries / denom) * 100).toFixed(1);
  }, [metrics.acknowledgedEntries, metrics.totalEntries]);

  const pendingRate = useMemo(() => {
    const denom = metrics.totalEntries || 1;
    return ((metrics.pendingEntries / denom) * 100).toFixed(1);
  }, [metrics.pendingEntries, metrics.totalEntries]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-card-foreground">
            Vanitga Payment Overview - FY {selectedFY}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time summary across all sabhas (Acknowledged amount counted as collected)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadOverview}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card hover:bg-muted/30 text-sm"
            disabled={loading}
          >
            <Icon name="RefreshCw" size={16} />
            Refresh
          </button>
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setIsExportOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card hover:bg-muted/30 text-sm"
            >
              <Icon name="Download" size={16} />
              Export
            </button>
            {isExportOpen && (
              <div className="absolute right-0 mt-2 w-40 bg-popover border border-border rounded-md shadow-lg z-50">
                <button
                  onClick={handleExportPdf}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                >
                  Export PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {loadError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
          Failed to load overview: {loadError}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total Sabhas */}
        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Icon name="Building2" size={24} color="var(--color-primary)" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Sabhas</h3>
          <p className="text-2xl font-bold text-card-foreground">{loading ? '—' : metrics.totalSabhas}</p>
        </div>

        {/* Total Vantiga Collected */}
        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Icon name="IndianRupee" size={24} color="#22c55e" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Vantiga Amount Collected (Ack)</h3>
          <p className="text-2xl font-bold text-card-foreground">
            {loading ? '—' : formatCurrency(metrics.totalVantigaCollected)}
          </p>
        </div>

        {/* Acknowledged Entries */}
        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Icon name="CheckCircle" size={24} color="#22c55e" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Entries Acknowledged</h3>
          <p className="text-2xl font-bold text-card-foreground">{loading ? '—' : metrics.acknowledgedEntries}</p>
        </div>

      </div>

      {/* Top Performing Sabhas */}
      <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-card-foreground mb-4">
          Sabhas with most collection (by acknowledged amount)
        </h3>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : topPerformingSabhas.length > 0 ? (
          <div className="space-y-3">
            {topPerformingSabhas.map((sabha, index) => (
              <div
                key={sabha.sabhaId || sabha.name || index}
                className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 bg-primary text-primary-foreground rounded-full font-semibold text-sm">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-card-foreground">{sabha.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {sabha.acknowledgedEntries} acknowledged • {sabha.pendingEntries} pending • {sabha.members} members
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-semibold text-card-foreground">
                    {formatCurrency(sabha.amountAcknowledged)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <Icon name="BarChart3" size={36} />
            <p className="text-sm">No sabha data found for this FY</p>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Icon name="Users" size={20} color="#3b82f6" />
            </div>
            <h3 className="text-base font-semibold text-card-foreground">Member Statistics</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Members</span>
              <span className="font-semibold text-card-foreground">{loading ? '—' : metrics.totalMembers}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Avg Members/Entry</span>
              <span className="font-semibold text-card-foreground">
                {loading ? '—' : avgMembersPerEntry}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Icon name="Activity" size={20} color="#22c55e" />
            </div>
            <h3 className="text-base font-semibold text-card-foreground">Collection Rate</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Acknowledgement Rate</span>
              <span className="font-semibold text-card-foreground">
                {loading ? '—' : `${acknowledgementRate}%`}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Pending Rate</span>
              <span className="font-semibold text-card-foreground">
                {loading ? '—' : `${pendingRate}%`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;
