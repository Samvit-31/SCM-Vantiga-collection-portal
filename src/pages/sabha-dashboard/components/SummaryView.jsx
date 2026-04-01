import React, { useMemo, useImperativeHandle, forwardRef, useRef } from 'react';
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
  Legend,
} from 'recharts';
import Icon from '../../../components/AppIcon';
import { formatCurrencyINR } from '../../../utils/amount';

const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

const SummaryView = forwardRef(({
  selectedFY,
  selectedFYs = [],
  summaryMode = 'single',
  fyOptions = [],
  userProfile,
  entries = [],
  pratinidhiFilter = 'ALL',
  pratinidhiOptions = [],
  onPratinidhiFilterChange,
}, ref) => {
  const summaryRef = useRef(null);

  const getEntryFy = (entry) => entry?.fy;
  const getEntryType = (entry) => entry?.entryType || entry?.entry_type || 'Vantiga';
  const getEntryStatus = (entry) => entry?.status;
  const getEntrySubmittedBy = (entry) => entry?.submitted_by || entry?.submittedBy || entry?.submittedByUserId;
  const getEntryDate = (entry) =>
    entry?.acknowledgedDate || entry?.acknowledged_at || entry?.submittedDate || entry?.submitted_at;
  const getEntrySabhaId = (entry) =>
    entry?.sabhaId ||
    entry?.sabha_id ||
    entry?.family?.sabhaId ||
    entry?.family?.sabha_id ||
    entry?.families?.sabha_id;
  const getEntrySabhaName = (entry) => entry?.family?.sabha || entry?.sabha || entry?.families?.sabha;
  const getEntryMembers = (entry) =>
    entry?.members || entry?.family?.family_members || entry?.families?.family_members || [];
  const getEntryPaidBy = (entry) => entry?.paidBy || entry?.paid_by;

  const formatAmount = formatCurrencyINR;

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date?.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
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

  const openSummaryPrintWindow = (title, sourceNode) => {
    const printWindow = window.open('', '_blank', 'width=1300,height=900');
    if (!printWindow || !sourceNode) return;

    const headMarkup = Array.from(
      document.querySelectorAll('style, link[rel="stylesheet"]')
    )
      .map((node) => node.outerHTML)
      .join('\n');
    const contentWidth = Math.max(sourceNode.scrollWidth || 0, sourceNode.offsetWidth || 0, 960);

    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    ${headMarkup}
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      body { margin: 0; padding: 16px; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .summary-print-root { width: ${contentWidth}px; margin: 0 auto; }
      svg { max-width: 100%; }
    </style>
  </head>
  <body>
    <div id="summary-print-root" class="summary-print-root"></div>
  </body>
</html>`);
    printWindow.document.close();

    const appendContent = () => {
      const container = printWindow.document.getElementById('summary-print-root');
      if (!container) return;
      container.appendChild(sourceNode.cloneNode(true));
      printWindow.focus();
      printWindow.print();
      printWindow.onafterprint = () => printWindow.close();
    };

    if (printWindow.document.readyState === 'complete') {
      setTimeout(appendContent, 0);
    } else {
      printWindow.onload = () => setTimeout(appendContent, 0);
    }
  };

  const orderedFYs = useMemo(() => {
    const base = selectedFYs?.length ? selectedFYs : (selectedFY ? [selectedFY] : []);
    if (!fyOptions?.length) return [...new Set(base)];
    const order = fyOptions.map((opt) => opt.value);
    return [...new Set(base)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [selectedFY, selectedFYs, fyOptions]);

  const isTreasurer = userProfile?.role === 'treasurer';
  const isCompareModeActive = isTreasurer && summaryMode === 'compare' && orderedFYs.length > 1;

  const filteredEntries = useMemo(() => {
    if (!entries || orderedFYs.length === 0) return [];

    const sabhaId = userProfile?.sabhaId || null;
    const sabhaName = userProfile?.sabha || null;
    const currentUserId = userProfile?.user_id || userProfile?.userId || null;

    return entries.filter((entry) => {
      const entryFY = getEntryFy(entry);
      if (!orderedFYs.includes(entryFY)) return false;
      if (getEntryType(entry) !== 'Vantiga') return false;

      if (userProfile?.role === 'treasurer' && pratinidhiFilter && pratinidhiFilter !== 'ALL') {
        if (getEntrySubmittedBy(entry) !== pratinidhiFilter) return false;
      }

      if (userProfile?.role === 'pratinidhi' && currentUserId) {
        if (getEntrySubmittedBy(entry) !== currentUserId) return false;
      }

      if (sabhaId) {
        const entrySabhaId = getEntrySabhaId(entry);
        return entrySabhaId ? entrySabhaId === sabhaId : true;
      }

      if (sabhaName) {
        return getEntrySabhaName(entry) === sabhaName;
      }

      return true;
    });
  }, [entries, orderedFYs, userProfile, pratinidhiFilter]);

  const computeKpis = (entryList) => {
    const all = entryList || [];
    const acknowledged = all.filter((e) => getEntryStatus(e) === 'ACKNOWLEDGED');
    const submitted = all.filter((e) => getEntryStatus(e) === 'SUBMITTED');

    const totalFamiliesAll = all.length;
    const totalMembersAll = all.reduce((sum, e) => sum + getEntryMembers(e).length, 0);
    const totalFamiliesAck = acknowledged.length;
    const totalMembersAck = acknowledged.reduce((sum, e) => sum + getEntryMembers(e).length, 0);
    const totalFamiliesPending = submitted.length;
    const totalMembersPending = submitted.reduce((sum, e) => sum + getEntryMembers(e).length, 0);

    const totalVantigaAmountCollected = acknowledged.reduce((sum, e) => {
      const entryTotal = getEntryMembers(e).reduce((mSum, m) => mSum + (Number(m?.amount) || 0), 0);
      return sum + entryTotal;
    }, 0);

    return {
      totalSubmitted: { families: totalFamiliesAll, members: totalMembersAll },
      totalAcknowledged: { families: totalFamiliesAck, members: totalMembersAck },
      pendingAcknowledgement: { families: totalFamiliesPending, members: totalMembersPending },
      totalVantigaAmountCollected,
    };
  };

  const kpisByFY = useMemo(() => {
    const grouped = new Map();
    orderedFYs.forEach((fy) => {
      grouped.set(fy, computeKpis(filteredEntries.filter((entry) => getEntryFy(entry) === fy)));
    });
    return grouped;
  }, [filteredEntries, orderedFYs]);

  const totalKpis = useMemo(() => computeKpis(filteredEntries), [filteredEntries]);

  const kpiData = [
    {
      id: 1,
      title: 'Total Entries Submitted',
      families: totalKpis?.totalSubmitted?.families,
      members: totalKpis?.totalSubmitted?.members,
      icon: 'FileText',
      color: '#3b82f6',
      bgColor: 'bg-blue-500/10',
    },
    {
      id: 2,
      title: 'Total Entries Acknowledged',
      families: totalKpis?.totalAcknowledged?.families,
      members: totalKpis?.totalAcknowledged?.members,
      icon: 'CheckCircle2',
      color: '#22c55e',
      bgColor: 'bg-green-500/10',
    },
    {
      id: 3,
      title: 'Pending Entries to be Acknowledged',
      families: totalKpis?.pendingAcknowledgement?.families,
      members: totalKpis?.pendingAcknowledgement?.members,
      icon: 'Clock',
      color: '#f59e0b',
      bgColor: 'bg-amber-500/10',
    },
    {
      id: 4,
      title: 'Total Vantiga Amount Collected',
      value: formatAmount(totalKpis?.totalVantigaAmountCollected),
      icon: 'IndianRupee',
      color: '#0ea5e9',
      bgColor: 'bg-sky-500/10',
      isCurrency: true,
    },
  ];

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const demographicsData = useMemo(() => {
    const acknowledgedEntries = filteredEntries.filter((e) => getEntryStatus(e) === 'ACKNOWLEDGED');
    const ageGroups = { '18-35': 0, '36-60': 0, '61+': 0 };

    acknowledgedEntries.forEach((entry) => {
      getEntryMembers(entry).forEach((member) => {
        const age = Number(member?.age || 0);
        if (age >= 18 && age <= 35) ageGroups['18-35']++;
        else if (age >= 36 && age <= 60) ageGroups['36-60']++;
        else if (age >= 61) ageGroups['61+']++;
      });
    });

    const total = ageGroups['18-35'] + ageGroups['36-60'] + ageGroups['61+'];

    return [
      { name: '18-35 years', value: ageGroups['18-35'] },
      { name: '36-60 years', value: ageGroups['36-60'] },
      { name: '61+ years', value: ageGroups['61+'] },
    ].map((item) => ({
      ...item,
      percentage: total > 0 ? ((item.value / total) * 100).toFixed(1) : 0,
    }));
  }, [filteredEntries]);

  const monthlyTrendData = useMemo(() => {
    const rows = MONTHS.map((month) => ({ month, vantigaAmount: 0 }));

    filteredEntries
      .filter((e) => getEntryStatus(e) === 'ACKNOWLEDGED')
      .forEach((entry) => {
        const dateValue = getEntryDate(entry);
        if (!dateValue) return;
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) return;

        const monthIndex = date.getMonth();
        const fyMonthIndex = monthIndex >= 3 ? monthIndex - 3 : monthIndex + 9;
        const entryTotal = getEntryMembers(entry).reduce((sum, m) => sum + (Number(m?.amount) || 0), 0);
        rows[fyMonthIndex].vantigaAmount += entryTotal;
      });

    return rows;
  }, [filteredEntries]);

  const paymentModeData = useMemo(() => {
    const acknowledgedEntries = filteredEntries.filter((e) => getEntryStatus(e) === 'ACKNOWLEDGED');
    const modes = { Cash: 0, Cheque: 0, 'NEFT/RTGS/IMPS': 0, UPI: 0, Other: 0 };

    acknowledgedEntries.forEach((entry) => {
      const entryTotal = getEntryMembers(entry).reduce((sum, m) => sum + (Number(m?.amount) || 0), 0);
      const mode = getEntryPaidBy(entry);

      if (mode === 'Cash') modes.Cash += entryTotal;
      else if (mode === 'Cheque') modes.Cheque += entryTotal;
      else if (mode === 'NEFT' || mode === 'Online') modes['NEFT/RTGS/IMPS'] += entryTotal;
      else if (mode === 'UPI') modes.UPI += entryTotal;
      else modes.Other += entryTotal;
    });

    return Object.entries(modes)
      .map(([name, value]) => ({ name, value }))
      .filter((item) => item.value > 0);
  }, [filteredEntries]);

  const recentlyAcknowledged = useMemo(() => {
    return filteredEntries
      .filter((e) => getEntryStatus(e) === 'ACKNOWLEDGED')
      .sort((a, b) => new Date(getEntryDate(b)) - new Date(getEntryDate(a)))
      .slice(0, 5);
  }, [filteredEntries]);

  const exportSummaryCsv = () => {
    const headers = [
      'FY',
      'Submitted Families',
      'Submitted Members',
      'Acknowledged Families',
      'Acknowledged Members',
      'Pending Families',
      'Pending Members',
      'Total Vantiga Collected',
    ];

    const rows = orderedFYs.map((fy) => {
      const kpis = kpisByFY.get(fy);
      return [
        fy,
        kpis?.totalSubmitted?.families ?? 0,
        kpis?.totalSubmitted?.members ?? 0,
        kpis?.totalAcknowledged?.families ?? 0,
        kpis?.totalAcknowledged?.members ?? 0,
        kpis?.pendingAcknowledgement?.families ?? 0,
        kpis?.pendingAcknowledgement?.members ?? 0,
        kpis?.totalVantigaAmountCollected ?? 0,
      ];
    });

    const filename = isCompareModeActive
      ? `summary-comparison-fy-${orderedFYs.join('_')}.csv`
      : `summary-fy-${orderedFYs[0] || 'na'}.csv`;

    downloadCsv(headers, rows, filename);
  };

  const exportSummaryPdf = () => {
    const title = isCompareModeActive
      ? `Treasurer Summary - FY ${orderedFYs.join(', ')}`
      : `Treasurer Summary - FY ${orderedFYs[0] || ''}`;
    openSummaryPrintWindow(title, summaryRef.current);
  };

  useImperativeHandle(ref, () => ({
    exportSummaryPdf,
    exportSummaryCsv,
  }));

  const infoFYLabel = orderedFYs.length > 0 ? orderedFYs.join(', ') : '-';

  return (
    <div className="space-y-6" ref={summaryRef}>
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Icon name="Calendar" size={18} color="var(--color-primary)" />
          <p className="text-sm font-medium text-foreground">
            Summary for FY {infoFYLabel}
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {isTreasurer && (
            <>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Icon name="Users" size={18} />
                Pratinidhi
              </div>
              <div className="w-full sm:w-64">
                <Select
                  value={pratinidhiFilter}
                  onChange={(value) => onPratinidhiFilterChange?.(value)}
                  options={pratinidhiOptions?.length ? pratinidhiOptions : [{ value: 'ALL', label: 'All Pratinidhis' }]}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {isCompareModeActive ? (
        <div className="bg-card border border-border rounded-lg shadow-sm">
          <div className="px-6 pt-6">
            <h3 className="text-lg font-semibold text-card-foreground">FY Comparison</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Submitted, acknowledged, pending, and collected totals by FY
            </p>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[900px] w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider sticky left-0 bg-muted/50">FY</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Submitted (Families | Members)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Acknowledged (Families | Members)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Pending (Families | Members)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">Vantiga (INR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orderedFYs.map((fy) => {
                  const kpis = kpisByFY.get(fy);
                  return (
                    <tr key={fy} className="bg-card">
                      <td className="px-4 py-3 text-sm font-semibold text-foreground sticky left-0 bg-card">{fy}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{kpis?.totalSubmitted?.families ?? 0} | {kpis?.totalSubmitted?.members ?? 0}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{kpis?.totalAcknowledged?.families ?? 0} | {kpis?.totalAcknowledged?.members ?? 0}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{kpis?.pendingAcknowledgement?.families ?? 0} | {kpis?.pendingAcknowledgement?.members ?? 0}</td>
                      <td className="px-4 py-3 text-sm text-foreground font-semibold">{formatAmount(kpis?.totalVantigaAmountCollected)}</td>
                    </tr>
                  );
                })}
                {orderedFYs.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={5}>
                      No data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {kpiData.map((kpi) => (
            <div key={kpi.id} className="bg-card rounded-lg border border-border p-6 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 ${kpi.bgColor} rounded-lg`}>
                  <Icon name={kpi.icon} size={24} color={kpi.color} />
                </div>
              </div>

              <h3 className="text-sm font-medium text-muted-foreground mb-1">{kpi.title}</h3>

              {kpi.isCurrency ? (
                <p className="text-2xl font-bold text-card-foreground">{kpi.value}</p>
              ) : (
                <>
                  <p className="text-2xl font-bold text-card-foreground">{kpi.families}</p>
                  <p className="text-xs text-muted-foreground mt-1">Members: {kpi.members}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className={isTreasurer ? 'grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8' : 'grid grid-cols-1 gap-6 mt-8'}>
        {isTreasurer && (
          <div className="bg-card rounded-lg border border-border shadow-sm p-6">
            <h3 className="text-lg font-semibold text-card-foreground mb-4 flex items-center gap-2">
              <Icon name="Users" size={20} />
              Demographics of Payers
            </h3>
            <p className="text-xs text-muted-foreground mb-4">Age distribution (Acknowledged entries only)</p>

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
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {demographicsData.map((d, index) => (
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
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
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
                <p className="text-sm">No data available for the selected period</p>
              </div>
            )}
          </div>
        )}

        <div className="bg-card rounded-lg border border-border shadow-sm p-6">
          <h3 className="text-lg font-semibold text-card-foreground mb-4 flex items-center gap-2">
            <Icon name="TrendingUp" size={20} />
            Month-wise Trend
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Acknowledged Vantiga amounts by month</p>

          {monthlyTrendData.some((d) => d.vantigaAmount > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `Rs${Math.round(value / 1000)}k`} />
                <Tooltip formatter={(value, name) => [formatAmount(value), name]} />
                <Legend />
                <Bar dataKey="vantigaAmount" name="Vantiga" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Icon name="BarChart2" size={48} className="mb-3" />
              <p className="text-sm">No data available for the selected period</p>
            </div>
          )}
        </div>
      </div>

      {isTreasurer && (
        <div className="bg-card rounded-lg border border-border shadow-sm p-6">
          <h3 className="text-lg font-semibold text-card-foreground mb-4 flex items-center gap-2">
            <Icon name="CreditCard" size={20} />
            Mode of Payment Distribution
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Distribution by payment mode (Acknowledged entries only)</p>

          {paymentModeData.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={paymentModeData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${formatAmount(value)}`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {paymentModeData.map((d, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatAmount(value)} />
                </PieChart>
              </ResponsiveContainer>

              <div className="flex flex-col justify-center space-y-3">
                {paymentModeData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="font-medium text-foreground">{item.name}</span>
                    </div>
                    <span className="font-bold text-foreground">{formatAmount(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Icon name="PieChart" size={48} className="mb-3" />
              <p className="text-sm">No data available for the selected period</p>
            </div>
          )}
        </div>
      )}

      {recentlyAcknowledged.length > 0 && (
        <div className="bg-card rounded-lg border border-border shadow-sm p-6">
          <h3 className="text-lg font-semibold text-card-foreground mb-4 flex items-center gap-2">
            <Icon name="Clock" size={20} />
            Recently Acknowledged Entries
          </h3>
          <div className="space-y-2">
            {recentlyAcknowledged.map((entry) => {
              const entryMembers = getEntryMembers(entry);
              const totalAmount = entryMembers.reduce((sum, m) => sum + (Number(m?.amount) || 0), 0);
              const payerName =
                entryMembers.find((m) => m.isPrimaryPayer)?.name ||
                entryMembers.find((m) => m.is_primary_payer)?.full_name ||
                entryMembers?.[0]?.name ||
                entryMembers?.[0]?.full_name ||
                'Unknown';

              return (
                <div
                  key={entry?.entryId || entry?.id}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{payerName}</p>
                    <p className="text-xs text-muted-foreground">Receipt: {entry?.receiptNo || entry?.receipt_no}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">{formatAmount(totalAmount)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(getEntryDate(entry))}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {filteredEntries.length === 0 && (
        <div className="bg-muted/30 border border-border rounded-lg p-6 text-center">
          <Icon name="Info" size={48} className="mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium text-foreground mb-2">No Data Available</h3>
          <p className="text-sm text-muted-foreground">
            No entries found for FY {infoFYLabel} in sabha {userProfile?.sabha || '-'}. Start by submitting entries from the Entries tab.
          </p>
        </div>
      )}
    </div>
  );
});

export default SummaryView;
