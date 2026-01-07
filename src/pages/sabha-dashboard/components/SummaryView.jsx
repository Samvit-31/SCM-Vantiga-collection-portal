import React, { useMemo, useImperativeHandle, forwardRef } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Icon from '../../../components/AppIcon';

const SummaryView = forwardRef(({ selectedFY, userProfile, entries = [] }, ref) => {
  // ✅ Robust filter: by FY + sabhaId when available (fallback to sabha name)
  const filteredEntries = useMemo(() => {
    if (!entries || !selectedFY) return [];

    const sabhaId = userProfile?.sabhaId || null;
    const sabhaName = userProfile?.sabha || null;

    return entries.filter((entry) => {
      if (entry?.fy !== selectedFY) return false;

      // Prefer sabhaId filtering
      if (sabhaId) {
        const entrySabhaId = entry?.sabhaId || entry?.sabha_id || entry?.family?.sabhaId || entry?.family?.sabha_id;
        return entrySabhaId ? entrySabhaId === sabhaId : true; // if missing, don't exclude harshly
      }

      // Fallback: sabha name match (legacy/mock)
      if (sabhaName) {
        return (entry?.family?.sabha || entry?.sabha || '') === sabhaName;
      }

      return true;
    });
  }, [entries, selectedFY, userProfile]);

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    })?.format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date?.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
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

  const openPrintWindow = (title, bodyHtml) => {
    const printWindow = window.open('', '_blank', 'width=1100,height=900');
    if (!printWindow) return;

    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; }
      h1 { font-size: 20px; margin: 0 0 6px; }
      h2 { font-size: 14px; margin: 18px 0 8px; }
      p { margin: 0 0 12px; color: #475569; font-size: 12px; }
      .kpi-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
      .label { font-size: 12px; color: #64748b; margin-bottom: 6px; }
      .value { font-size: 18px; font-weight: 700; }
      .sub { font-size: 11px; color: #64748b; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
      th { background: #f1f5f9; text-transform: uppercase; letter-spacing: 0.02em; }
      .right { text-align: right; }
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

  // ✅ KPIs per your definitions
  const kpis = useMemo(() => {
    const all = filteredEntries || [];

    const acknowledged = all.filter(e => e?.status === 'ACKNOWLEDGED');
    const submitted = all.filter(e => e?.status === 'SUBMITTED'); // pending ack

    const totalFamiliesAll = all.length;
    const totalMembersAll = all.reduce((sum, e) => sum + (e?.members?.length || 0), 0);

    const totalFamiliesAck = acknowledged.length;
    const totalMembersAck = acknowledged.reduce((sum, e) => sum + (e?.members?.length || 0), 0);

    const totalFamiliesPending = submitted.length;
    const totalMembersPending = submitted.reduce((sum, e) => sum + (e?.members?.length || 0), 0);

    const totalVantigaAmountCollected = acknowledged.reduce((sum, e) => {
      const entryTotal = e?.members?.reduce((mSum, m) => mSum + (Number(m?.amount) || 0), 0) || 0;
      return sum + entryTotal;
    }, 0);

    return {
      totalSubmitted: { families: totalFamiliesAll, members: totalMembersAll },          // ✅ all entries (families/forms | members)
      totalAcknowledged: { families: totalFamiliesAck, members: totalMembersAck },      // ✅ acknowledged only
      pendingAcknowledgement: { families: totalFamiliesPending, members: totalMembersPending }, // ✅ submitted only
      totalVantigaAmountCollected
    };
  }, [filteredEntries]);

  const isPratinidhi = userProfile?.role === 'pratinidhi';

  // Demographics Chart Data (Age Distribution - Acknowledged only)
  const demographicsData = useMemo(() => {
    const acknowledgedEntries = filteredEntries.filter(e => e?.status === 'ACKNOWLEDGED');
    const ageGroups = { '18-35': 0, '36-60': 0, '61+': 0 };

    acknowledgedEntries.forEach(entry => {
      (entry?.members || []).forEach(member => {
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
      { name: '61+ years', value: ageGroups['61+'] }
    ].map(item => ({
      ...item,
      percentage: total > 0 ? ((item.value / total) * 100).toFixed(1) : 0
    }));
  }, [filteredEntries]);

  // Month-wise Trend Data (Acknowledged only)
  const monthlyTrendData = useMemo(() => {
    const acknowledgedEntries = filteredEntries.filter(e => e?.status === 'ACKNOWLEDGED');
    const months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    const monthlyData = months.map(month => ({ month, amount: 0 }));

    acknowledgedEntries.forEach(entry => {
      const date = new Date(entry?.acknowledgedDate || entry?.submittedDate);
      const monthIndex = date.getMonth(); // 0=Jan
      const fyMonthIndex = monthIndex >= 3 ? monthIndex - 3 : monthIndex + 9; // FY starts Apr

      const entryTotal = (entry?.members || []).reduce((sum, m) => sum + (Number(m?.amount) || 0), 0);
      monthlyData[fyMonthIndex].amount += entryTotal;
    });

    return monthlyData;
  }, [filteredEntries]);

  // Payment Mode Distribution Data (Acknowledged only) - amounts
  const paymentModeData = useMemo(() => {
    const acknowledgedEntries = filteredEntries.filter(e => e?.status === 'ACKNOWLEDGED');
    const modes = { Cash: 0, Cheque: 0, 'NEFT/RTGS/IMPS': 0, UPI: 0, Other: 0 };

    acknowledgedEntries.forEach(entry => {
      const entryTotal = (entry?.members || []).reduce((sum, m) => sum + (Number(m?.amount) || 0), 0);
      const mode = entry?.paidBy;

      if (mode === 'Cash') modes.Cash += entryTotal;
      else if (mode === 'Cheque') modes.Cheque += entryTotal;
      else if (mode === 'NEFT' || mode === 'Online') modes['NEFT/RTGS/IMPS'] += entryTotal;
      else if (mode === 'UPI') modes.UPI += entryTotal;
      else modes.Other += entryTotal;
    });

    return Object.entries(modes)
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0);
  }, [filteredEntries]);

  // Recently Acknowledged Entries
  const recentlyAcknowledged = useMemo(() => {
    return filteredEntries
      .filter(e => e?.status === 'ACKNOWLEDGED')
      .sort((a, b) => new Date(b.acknowledgedDate) - new Date(a.acknowledgedDate))
      .slice(0, 5);
  }, [filteredEntries]);

  // ✅ KPI cards per your exact text
  const kpiData = [
    {
      id: 1,
      title: 'Total Entries Submitted',
      families: kpis?.totalSubmitted?.families,
      members: kpis?.totalSubmitted?.members,
      icon: 'FileText',
      color: '#3b82f6',
      bgColor: 'bg-blue-500/10'
    },
    {
      id: 2,
      title: 'Total Entries Acknowledged',
      families: kpis?.totalAcknowledged?.families,
      members: kpis?.totalAcknowledged?.members,
      icon: 'CheckCircle2',
      color: '#22c55e',
      bgColor: 'bg-green-500/10'
    },
    {
      id: 3,
      title: 'Pending Entries to be Acknowledged',
      families: kpis?.pendingAcknowledgement?.families,
      members: kpis?.pendingAcknowledgement?.members,
      icon: 'Clock',
      color: '#f59e0b',
      bgColor: 'bg-amber-500/10'
    },
    {
      id: 4,
      title: 'Total Vantiga Amount Acknowledged',
      value: formatAmount(kpis?.totalVantigaAmountCollected),
      icon: 'IndianRupee',
      color: '#a855f7',
      bgColor: 'bg-purple-500/10',
      isCurrency: true
    }
  ];

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const exportSummaryPdf = () => {
    const kpiCards = kpiData.map((kpi) => {
      const value = kpi.isCurrency ? kpi.value : kpi.families;
      const sub = kpi.isCurrency ? '' : `Families/Forms: ${kpi.families} | Members: ${kpi.members}`;
      return `
        <div class="card">
          <div class="label">${escapeHtml(kpi.title)}</div>
          <div class="value">${escapeHtml(value)}</div>
          ${sub ? `<div class="sub">${escapeHtml(sub)}</div>` : ''}
        </div>
      `;
    }).join('');

    const demographicsRows = demographicsData.map((row) => `
      <tr>
        <td>${escapeHtml(row.name)}</td>
        <td class="right">${row.value}</td>
        <td class="right">${row.percentage}%</td>
      </tr>
    `).join('');

    const monthlyRows = monthlyTrendData.map((row) => `
      <tr>
        <td>${escapeHtml(row.month)}</td>
        <td class="right">${escapeHtml(formatAmount(row.amount))}</td>
      </tr>
    `).join('');

    const paymentRows = paymentModeData.map((row) => `
      <tr>
        <td>${escapeHtml(row.name)}</td>
        <td class="right">${escapeHtml(formatAmount(row.value))}</td>
      </tr>
    `).join('');

    const recentRows = recentlyAcknowledged.map((entry) => {
      const payerName =
        entry?.members?.find((m) => m.isPrimaryPayer)?.name ||
        entry?.members?.[0]?.name ||
        'Unknown';
      const totalAmount =
        entry?.members?.reduce((sum, m) => sum + (Number(m?.amount) || 0), 0) || 0;
      return `
        <tr>
          <td>${escapeHtml(payerName)}</td>
          <td>${escapeHtml(formatDate(entry?.acknowledgedDate || entry?.submittedDate))}</td>
          <td class="right">${escapeHtml(formatAmount(totalAmount))}</td>
        </tr>
      `;
    }).join('');

    const bodyHtml = `
      <h1>Sabha Summary - FY ${escapeHtml(selectedFY)}</h1>
      <p>Exported summary snapshot</p>
      <div class="kpi-grid">${kpiCards}</div>

      <h2>Demographics of Payers (Acknowledged)</h2>
      <table>
        <thead>
          <tr>
            <th>Age Group</th>
            <th class="right">Count</th>
            <th class="right">Share</th>
          </tr>
        </thead>
        <tbody>
          ${demographicsRows || '<tr><td colspan="3">No data</td></tr>'}
        </tbody>
      </table>

      <h2>Monthly Trend (Acknowledged)</h2>
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th class="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${monthlyRows || '<tr><td colspan="2">No data</td></tr>'}
        </tbody>
      </table>

      <h2>Payment Mode Distribution (Acknowledged)</h2>
      <table>
        <thead>
          <tr>
            <th>Mode</th>
            <th class="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${paymentRows || '<tr><td colspan="2">No data</td></tr>'}
        </tbody>
      </table>

      <h2>Recently Acknowledged</h2>
      <table>
        <thead>
          <tr>
            <th>Payer Name</th>
            <th>Date</th>
            <th class="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${recentRows || '<tr><td colspan="3">No data</td></tr>'}
        </tbody>
      </table>
    `;

    openPrintWindow(`Sabha Summary - FY ${selectedFY}`, bodyHtml);
  };

  useImperativeHandle(ref, () => ({
    exportSummaryPdf,
  }));

  return (
    <div className="space-y-6">
      {/* Selected FY Info */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Icon name="Calendar" size={18} color="var(--color-primary)" />
          <p className="text-sm font-medium text-foreground">
            Summary — FY <span className="font-semibold">{selectedFY}</span>
          </p>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                <p className="text-xs text-muted-foreground mt-1">
                  Families: {kpi.families} | Members: {kpi.members}
                </p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className={isPratinidhi ? "grid grid-cols-1 gap-6 mt-8" : "grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8"}>
        {/* Demographics Chart */}
        {!isPratinidhi && (
          <div className="bg-card rounded-lg border border-border shadow-sm p-6">
            <h3 className="text-lg font-semibold text-card-foreground mb-4 flex items-center gap-2">
              <Icon name="Users" size={20} />
              Demographics of Payers
            </h3>
            <p className="text-xs text-muted-foreground mb-4">Age distribution (Acknowledged entries only)</p>

            {demographicsData.some(d => d.value > 0) ? (
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

        {/* Month-wise Trend Chart */}
        <div className="bg-card rounded-lg border border-border shadow-sm p-6">
          <h3 className="text-lg font-semibold text-card-foreground mb-4 flex items-center gap-2">
            <Icon name="TrendingUp" size={20} />
            Month-wise Trend
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Total acknowledged Vantiga amount by month</p>

          {monthlyTrendData.some(d => d.amount > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => formatAmount(value)} />
                <Bar dataKey="amount" fill="#10b981" />
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

      {/* Payment Mode Distribution Chart */}
      {!isPratinidhi && (
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

      {/* Recently Acknowledged Entries */}
      {recentlyAcknowledged.length > 0 && (
        <div className="bg-card rounded-lg border border-border shadow-sm p-6">
          <h3 className="text-lg font-semibold text-card-foreground mb-4 flex items-center gap-2">
            <Icon name="Clock" size={20} />
            Recently Acknowledged Entries
          </h3>
          <div className="space-y-2">
            {recentlyAcknowledged.map((entry) => {
              const totalAmount = (entry?.members || []).reduce((sum, m) => sum + (Number(m?.amount) || 0), 0);
              const payerName = entry?.members?.[0]?.name || 'Unknown';
              return (
                <div
                  key={entry?.entryId}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{payerName}</p>
                    <p className="text-xs text-muted-foreground">Receipt: {entry?.receiptNo}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">{formatAmount(totalAmount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry?.acknowledgedDate)?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Info Note */}
      {filteredEntries.length === 0 && (
        <div className="bg-muted/30 border border-border rounded-lg p-6 text-center">
          <Icon name="Info" size={48} className="mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium text-foreground mb-2">No Data Available</h3>
          <p className="text-sm text-muted-foreground">
            No entries found for FY {selectedFY} in sabha {userProfile?.sabha || '—'}.
            Start by submitting entries from the Entries tab.
          </p>
        </div>
      )}
    </div>
  );
});

export default SummaryView;
