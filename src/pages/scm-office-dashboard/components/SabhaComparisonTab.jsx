import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Icon from '../../../components/AppIcon';
import { supabase } from '../../../supabaseClient';
import { formatCurrencyINR } from '../../../utils/amount';

const SabhaComparisonTab = ({ selectedFY }) => {
  const [sabhaData, setSabhaData] = useState([]);
  const [originalData, setOriginalData] = useState([]); // for metrics independent of sorting
  const [sortConfig, setSortConfig] = useState({ key: 'totalAmount', direction: 'desc' });
  const [isExportOpen, setIsExportOpen] = useState(false);
  const exportRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const formatCurrency = formatCurrencyINR;

  const calculateAcknowledgementRate = (acknowledged, total) => {
    if (!total || total === 0) return '0.0';
    return ((acknowledged / total) * 100)?.toFixed(1);
  };

  const escapeHtml = (value) => {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const toCsvValue = (value) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const downloadCsv = (headers, rows, filename) => {
    const csv = [headers, ...rows]
      .map((row) => row.map(toCsvValue).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const openPrintWindow = (title, bodyHtml) => {
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) return;

    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      p { margin: 0 0 12px; color: #475569; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: right; }
      th { background: #f1f5f9; text-transform: uppercase; letter-spacing: 0.02em; }
      th:first-child, td:first-child { text-align: left; }
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

  const handleExportCsv = () => {
    setIsExportOpen(false);
    const headers = [
      'Sabha Name',
      'Total Entries',
      'Acknowledged',
      'Total Amount (Ack)'
    ];
    const rows = sabhaData.map((sabha) => {
      return [
        sabha?.name || '',
        sabha?.totalEntries ?? 0,
        sabha?.acknowledgedEntries ?? 0,
        sabha?.totalAmount ?? 0
      ];
    });
    downloadCsv(headers, rows, `sabha-comparison-${selectedFY}.csv`);
  };

  const handleExportPdf = () => {
    setIsExportOpen(false);
    const rowsHtml = sabhaData.map((sabha) => {
      return `
        <tr>
          <td>${escapeHtml(sabha?.name || '')}</td>
          <td>${sabha?.totalEntries ?? 0}</td>
          <td>${sabha?.acknowledgedEntries ?? 0}</td>
          <td>${escapeHtml(formatCurrency(sabha?.totalAmount))}</td>
        </tr>
      `;
    }).join('');

    const bodyHtml = `
      <h1>Sabha Comparison - FY ${escapeHtml(selectedFY)}</h1>
      <p>Sabha-wise metrics export</p>
      <table>
        <thead>
          <tr>
            <th>Sabha Name</th>
            <th>Total Entries</th>
            <th>Acknowledged</th>
            <th>Total Amount (Ack)</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="4">No data</td></tr>'}
        </tbody>
      </table>
    `;

    openPrintWindow(`Sabha Comparison - FY ${selectedFY}`, bodyHtml);
  };

  const loadSabhaComparison = useCallback(async () => {
    if (!selectedFY) return;

    setLoading(true);
    setLoadError(null);

    try {
      /**
       * Compute sabha-wise metrics for FY from Supabase:
       * - totalEntries (all)
       * - acknowledgedEntries (ACKNOWLEDGED)
       * - pendingEntries (SUBMITTED)
       * - totalMembers (all members across entries)
       * - totalAmount (ACKNOWLEDGED amount only)  ✅ matches "collection"
       * - avgPerEntry (ACKNOWLEDGED avg per acknowledged entry)
       */
      const { data, error } = await supabase
        .from('vantiga_entries')
        .select(`
          id,
          fy,
          status,
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

      const sabhaMap = new Map();

      (data || []).forEach((r) => {
        const sabhaId = r?.sabha_id || r?.sabhas?.id || null;
        const sabhaName = r?.sabhas?.name || '—';

        const key = sabhaId || sabhaName;

        if (!sabhaMap.has(key)) {
          sabhaMap.set(key, {
            sabhaId,
            name: sabhaName,
            totalEntries: 0,
            acknowledgedEntries: 0,
            pendingEntries: 0,
            rejectedEntries: 0,
            totalMembers: 0,
            totalAmount: 0, // ✅ acknowledged amount only
            avgPerEntry: 0
          });
        }

        const s = sabhaMap.get(key);

        const members = r?.families?.family_members || [];
        const membersCount = members.length;
        const entryAmount = members.reduce((sum, m) => sum + (Number(m?.amount) || 0), 0);

        s.totalEntries += 1;
        s.totalMembers += membersCount;

        if (r?.status === 'ACKNOWLEDGED') {
          s.acknowledgedEntries += 1;
          s.totalAmount += entryAmount;
        } else if (r?.status === 'SUBMITTED') {
          s.pendingEntries += 1;
        } else if (r?.status === 'REJECTED') {
          s.rejectedEntries += 1;
        }
      });

      const list = Array.from(sabhaMap.values()).map((s) => ({
        ...s,
        avgPerEntry: s.acknowledgedEntries > 0 ? Math.round(s.totalAmount / s.acknowledgedEntries) : 0
      }));

      // store originals for summary cards (independent of sorting)
      setOriginalData(list);

      // apply initial sort config
      const sorted = [...list].sort((a, b) => {
        const key = sortConfig.key;
        const dir = sortConfig.direction === 'asc' ? 1 : -1;

        const av = a?.[key];
        const bv = b?.[key];

        // string sort for name
        if (typeof av === 'string' || typeof bv === 'string') {
          return String(av).localeCompare(String(bv)) * dir;
        }
        return ((av ?? 0) - (bv ?? 0)) * dir;
      });

      setSabhaData(sorted);
    } catch (e) {
      console.error(e);
      setLoadError(e?.message || String(e));
      setOriginalData([]);
      setSabhaData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedFY, sortConfig.key, sortConfig.direction]);

  useEffect(() => {
    loadSabhaComparison();
  }, [loadSabhaComparison]);

  // ✅ Realtime refresh when entries change in this FY
  useEffect(() => {
    if (!selectedFY) return;

    const channel = supabase.channel(`scm_office_sabha_comparison_${selectedFY}`);

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

          if (matchesFY) loadSabhaComparison();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedFY, loadSabhaComparison]);

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

  // Summary cards computed from original (unsorted) data
  const metrics = useMemo(() => {
    if (!originalData || originalData.length === 0) {
      return { highestCollection: null, largest: null };
    }

    // Highest collection = max totalAmount (acknowledged)
    const highestCollection = originalData.reduce((max, sabha) =>
      (sabha?.totalAmount || 0) > (max?.totalAmount || 0) ? sabha : max
    , originalData[0]);

    // Largest sabha = max totalMembers
    const largest = originalData.reduce((max, sabha) =>
      (sabha?.totalMembers || 0) > (max?.totalMembers || 0) ? sabha : max
    , originalData[0]);

    return { highestCollection, largest };
  }, [originalData]);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });

    const sorted = [...sabhaData].sort((a, b) => {
      const dir = direction === 'asc' ? 1 : -1;

      const av = a?.[key];
      const bv = b?.[key];

      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * dir;
      }
      return ((av ?? 0) - (bv ?? 0)) * dir;
    });

    setSabhaData(sorted);
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return <Icon name="ChevronsUpDown" size={16} color="var(--color-muted-foreground)" />;
    }
    return sortConfig.direction === 'asc'
      ? <Icon name="ChevronUp" size={16} color="var(--color-primary)" />
      : <Icon name="ChevronDown" size={16} color="var(--color-primary)" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-card-foreground">
            Sabha-wise Metrics - FY {selectedFY}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Side-by-side analysis of all sabha performance metrics (collection = acknowledged amount)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadSabhaComparison}
            className="inline-flex items-center gap-0 sm:gap-2 px-3 py-2 rounded-md border border-border bg-card hover:bg-muted/30 text-sm"
            disabled={loading}
          >
            <Icon name="RefreshCw" size={16} />
            <span className="sr-only sm:not-sr-only sm:inline">Refresh</span>
          </button>
          <div className="relative" ref={exportRef}>
            <button
              onClick={() => setIsExportOpen((prev) => !prev)}
              className="inline-flex items-center gap-0 sm:gap-2 px-3 py-2 rounded-md border border-border bg-card hover:bg-muted/30 text-sm"
            >
              <Icon name="Download" size={16} />
              <span className="sr-only sm:not-sr-only sm:inline">Export</span>
            </button>
            {isExportOpen && (
              <div className="absolute right-0 mt-2 w-40 bg-popover border border-border rounded-md shadow-lg z-50">
                <button
                  onClick={handleExportPdf}
                  className="w-full inline-flex items-center gap-0 sm:gap-2 text-left px-3 py-2 text-sm hover:bg-muted"
                >
                  <Icon name="FileText" size={16} />
                  <span className="sr-only sm:not-sr-only sm:inline">Export PDF</span>
                </button>
                <button
                  onClick={handleExportCsv}
                  className="w-full inline-flex items-center gap-0 sm:gap-2 text-left px-3 py-2 text-sm hover:bg-muted"
                >
                  <Icon name="Download" size={16} />
                  <span className="sr-only sm:not-sr-only sm:inline">Export CSV</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {loadError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
          Failed to load sabha comparison: {loadError}
        </div>
      )}

      {/* Comparison Table */}
      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border bg-[#F97316] tracking-normal">
              <tr>
                <th className="text-left p-4 text-sm font-semibold text-card-foreground">
                  <button
                    onClick={() => handleSort('name')}
                    className="flex items-center gap-2 hover:text-primary transition-colors text-white"
                  >
                    Sabha Name
                    {getSortIcon('name')}
                  </button>
                </th>

                <th className="text-right p-4 text-sm font-semibold text-card-foreground">
                  <button
                    onClick={() => handleSort('totalEntries')}
                    className="flex items-center justify-end gap-2 ml-auto hover:text-primary transition-colors text-white"
                  >
                    Total Entries
                    {getSortIcon('totalEntries')}
                  </button>
                </th>

                <th className="text-right p-4 text-sm font-semibold text-card-foreground">
                  <button
                    onClick={() => handleSort('acknowledgedEntries')}
                    className="flex items-center justify-end gap-2 ml-auto hover:text-primary transition-colors text-white"
                  >
                    Acknowledged
                    {getSortIcon('acknowledgedEntries')}
                  </button>
                </th>

                <th className="text-right p-4 text-sm font-semibold text-card-foreground">
                  <button
                    onClick={() => handleSort('totalAmount')}
                    className="flex items-center justify-end gap-2 ml-auto hover:text-primary transition-colors text-white"
                  >
                    Total Amount (Ack)
                    {getSortIcon('totalAmount')}
                  </button>
                </th>

              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="p-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : sabhaData.length > 0 ? (
                sabhaData.map((sabha, index) => {
                  return (
                    <tr
                      key={sabha?.sabhaId || sabha?.name || index}
                      className="border-b border-border hover:bg-muted/30 transition-colors"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center justify-center w-6 h-6 bg-primary/10 text-primary rounded-full text-xs font-semibold">
                            {index + 1}
                          </div>
                          <span className="font-medium text-card-foreground">{sabha?.name}</span>
                        </div>
                      </td>

                      <td className="p-4 text-right text-card-foreground">{sabha?.totalEntries}</td>

                      <td className="p-4 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-600 rounded-full text-sm font-medium">
                          <Icon name="CheckCircle" size={14} />
                          {sabha?.acknowledgedEntries}
                        </span>
                      </td>

                      <td className="p-4 text-right font-semibold text-card-foreground">
                        {formatCurrency(sabha?.totalAmount)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="4" className="p-8 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Icon name="BarChart3" size={32} color="var(--color-muted-foreground)" />
                      <p>No sabha data found for FY {selectedFY}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Icon name="Award" size={20} color="#3b82f6" />
            </div>
            <h4 className="text-sm font-semibold text-card-foreground">Highest Collection</h4>
          </div>
          <p className="text-lg font-bold text-card-foreground">{metrics?.highestCollection?.name || '—'}</p>
          <p className="text-sm text-muted-foreground">
            {metrics?.highestCollection ? formatCurrency(metrics.highestCollection.totalAmount) : '—'}
          </p>
        </div>

        <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Icon name="Users" size={20} color="#a855f7" />
            </div>
            <h4 className="text-sm font-semibold text-card-foreground">Largest Sabha</h4>
          </div>
          <p className="text-lg font-bold text-card-foreground">{metrics?.largest?.name || '—'}</p>
          <p className="text-sm text-muted-foreground">
            {metrics?.largest ? `${metrics.largest.totalMembers} members` : '—'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default SabhaComparisonTab;
