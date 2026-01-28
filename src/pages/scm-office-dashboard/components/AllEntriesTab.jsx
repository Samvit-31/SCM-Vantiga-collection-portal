import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Icon from '../../../components/AppIcon';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import Button from '../../../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../supabaseClient';

const AllEntriesTab = ({ selectedFY }) => {
  const navigate = useNavigate();

  // ✅ Entry-level rows for dashboard
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [sabhaFilter, setSabhaFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const exportRef = useRef(null);

  // ---- Helpers ----
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0
    })?.format(Number(amount || 0));
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
    const printWindow = window.open('', '_blank', 'width=1300,height=900');
    if (!printWindow) return;

    printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      p { margin: 0 0 12px; color: #475569; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
      th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: top; }
      th { background: #f1f5f9; text-transform: uppercase; letter-spacing: 0.02em; }
      .nowrap { white-space: nowrap; }
      .muted { color: #64748b; }
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

  const getStatusBadge = (status) => {
    const statusConfig = {
      ACKNOWLEDGED: {
        bg: 'bg-green-500/10',
        text: 'text-green-600',
        icon: 'CheckCircle',
        label: 'Acknowledged'
      },
      SUBMITTED: {
        bg: 'bg-amber-500/10',
        text: 'text-amber-600',
        icon: 'Clock',
        label: 'Submitted'
      },
      REJECTED: {
        bg: 'bg-destructive/10',
        text: 'text-destructive',
        icon: 'XCircle',
        label: 'Rejected'
      }
    };

    const config = statusConfig?.[status] || statusConfig?.SUBMITTED;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium ${config?.bg} ${config?.text}`}>
        <Icon name={config?.icon} size={14} />
        {config?.label}
      </span>
    );
  };

  // ---- Data load (Supabase) ----
  const loadAllEntries = useCallback(async () => {
    if (!selectedFY) return;

    setLoading(true);
    setLoadError(null);

    try {
      /**
       * Pull entry + members; dashboard shows entry-level,
       * export expands member-wise.
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
        .eq('fy', selectedFY)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      // ✅ ENTRY-LEVEL mapping (for dashboard display)
      const mapped = (data || []).map((r) => {
        const members = r?.families?.family_members || [];
        const payer =
          members.find((m) => m.is_primary_payer)?.full_name ||
          members?.[0]?.full_name ||
          'Unknown';

        const totalAmount = members.reduce((sum, m) => sum + (Number(m?.amount) || 0), 0);

        return {
          id: r.id,
          fy: r.fy,
          sabhaId: r.sabha_id,
          sabha: r?.sabhas?.name || '—',
          sabhaCode: r?.sabhas?.code || '',
          payerName: payer,
          submittedDate: r.submitted_at,
          acknowledgedDate: r.acknowledged_at,
          totalAmount,
          membersCount: members.length,
          status: r.status,
          receiptNo: r.receipt_no || null,

          // ✅ Keep raw members for export expansion
          members: members.map((m) => ({
            id: m.id,
            full_name: m.full_name,
            age: m.age,
            gender: m.gender,
            gotra: m.gotra,
            amount: Number(m.amount || 0),
            is_primary_payer: !!m.is_primary_payer
          }))
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
    loadAllEntries();
  }, [loadAllEntries]);

  // ✅ Realtime refresh (SCM office)
  useEffect(() => {
    if (!selectedFY) return;

    const channel = supabase.channel(`scm_office_all_entries_${selectedFY}`);

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

          if (matchesFY) loadAllEntries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedFY, loadAllEntries]);

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

  // ---- Sabha options from current data ----
  const sabhaOptions = useMemo(() => {
    const unique = new Map();
    entries.forEach((e) => {
      if (e?.sabhaId && e?.sabha) unique.set(e.sabhaId, e.sabha);
    });

    const opts = Array.from(unique.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return [{ value: 'all', label: 'All Sabhas' }, ...opts];
  }, [entries]);

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'SUBMITTED', label: 'Submitted' },
    { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
    { value: 'REJECTED', label: 'Rejected' }
  ];

  // ---- Filtering (ENTRY-level) ----
  const filteredEntries = useMemo(() => {
    let filtered = [...entries];

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter((entry) =>
        entry?.payerName?.toLowerCase()?.includes(q) ||
        entry?.id?.toLowerCase()?.includes(q) ||
        (entry?.receiptNo ? String(entry.receiptNo).toLowerCase().includes(q) : false) ||
        (entry?.sabha ? entry.sabha.toLowerCase().includes(q) : false)
      );
    }

    if (sabhaFilter !== 'all') {
      filtered = filtered.filter((entry) => entry?.sabhaId === sabhaFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((entry) => entry?.status === statusFilter);
    }

    return filtered;
  }, [entries, searchTerm, sabhaFilter, statusFilter]);

  // ---- Export expansion (member-wise rows) ----
  const memberWiseRowsForExport = useMemo(() => {
    // Expand only what you are exporting (respect filters)
    return (filteredEntries || []).flatMap((entry) => {
      const members = entry?.members || [];
      if (!members.length) {
        return [{
          sabha: entry?.sabha || '',
          entryId: entry?.id || '',
          payerName: entry?.payerName || '',
          memberName: '',
          memberAge: '',
          memberGender: '',
          memberGotra: '',
          memberIsPrimary: '',
          submittedDate: entry?.submittedDate,
          acknowledgedDate: entry?.acknowledgedDate,
          memberAmount: 0,
          entryTotalAmount: entry?.totalAmount ?? 0,
          status: entry?.status || '',
          receiptNo: entry?.receiptNo || ''
        }];
      }

      return members.map((m) => ({
        sabha: entry?.sabha || '',
        entryId: entry?.id || '',
        payerName: entry?.payerName || '',
        memberName: m?.full_name || '',
        memberAge: m?.age ?? '',
        memberGender: m?.gender ?? '',
        memberGotra: m?.gotra ?? '',
        memberIsPrimary: m?.is_primary_payer ? 'Yes' : 'No',
        submittedDate: entry?.submittedDate,
        acknowledgedDate: entry?.acknowledgedDate,
        memberAmount: m?.amount ?? 0,
        entryTotalAmount: entry?.totalAmount ?? 0,
        status: entry?.status || '',
        receiptNo: entry?.receiptNo || ''
      }));
    });
  }, [filteredEntries]);

  const handleExportCsv = () => {
    setIsExportOpen(false);

    const headers = [
      'Sabha',
      'Entry ID',
      'Payer Name (Primary)',
      'Member Name',
      'Member Age',
      'Member Gender',
      'Member Gotra',
      'Primary Member',
      'Submitted Date',
      'Acknowledged Date',
      'Member Amount',
      'Entry Total Amount',
      'Status',
      'Receipt No'
    ];

    const rows = memberWiseRowsForExport.map((r) => ([
      r.sabha,
      r.entryId,
      r.payerName,
      r.memberName,
      r.memberAge,
      r.memberGender,
      r.memberGotra,
      r.memberIsPrimary,
      formatDate(r.submittedDate),
      formatDate(r.acknowledgedDate),
      r.memberAmount ?? 0,
      r.entryTotalAmount ?? 0,
      r.status,
      r.receiptNo
    ]));

    downloadCsv(headers, rows, `all-entries-memberwise-${selectedFY}.csv`);
  };

  const handleExportPdf = () => {
    setIsExportOpen(false);

    const rowsHtml = memberWiseRowsForExport.map((r) => `
      <tr>
        <td>${escapeHtml(r.sabha)}</td>
        <td class="nowrap">${escapeHtml(r.entryId)}</td>
        <td>${escapeHtml(r.payerName)}</td>
        <td>${escapeHtml(r.memberName || '-')}</td>
        <td class="nowrap">${escapeHtml(r.memberAge)}</td>
        <td class="nowrap">${escapeHtml(r.memberGender)}</td>
        <td>${escapeHtml(r.memberGotra)}</td>
        <td class="nowrap">${escapeHtml(r.memberIsPrimary)}</td>
        <td class="nowrap">${escapeHtml(formatDate(r.submittedDate))}</td>
        <td class="nowrap">${escapeHtml(formatDate(r.acknowledgedDate))}</td>
        <td class="nowrap">${escapeHtml(formatCurrency(r.memberAmount))}</td>
        <td class="nowrap">${escapeHtml(formatCurrency(r.entryTotalAmount))}</td>
        <td class="nowrap">${escapeHtml(r.status)}</td>
        <td class="nowrap">${escapeHtml(r.receiptNo || '-')}</td>
      </tr>
    `).join('');

    const bodyHtml = `
      <h1>All Entries (Member-wise Export) - FY ${escapeHtml(selectedFY)}</h1>
      <p class="muted">Rows exported: ${memberWiseRowsForExport.length} (expanded from ${filteredEntries.length} entries)</p>
      <table>
        <thead>
          <tr>
            <th>Sabha</th>
            <th>Entry ID</th>
            <th>Payer Name</th>
            <th>Member Name</th>
            <th>Age</th>
            <th>Gender</th>
            <th>Gotra</th>
            <th>Primary</th>
            <th>Submitted</th>
            <th>Acknowledged</th>
            <th>Member Amount</th>
            <th>Entry Total</th>
            <th>Status</th>
            <th>Receipt No</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="14">No data</td></tr>'}
        </tbody>
      </table>
    `;

    openPrintWindow(`All Entries (Member-wise Export) - FY ${selectedFY}`, bodyHtml);
  };

  // ---- High-level numbers (entry-level) ----
  const totals = useMemo(() => {
    const submittedCount = entries.filter(e => e.status === 'SUBMITTED').length;
    const acknowledgedCount = entries.filter(e => e.status === 'ACKNOWLEDGED').length;
    const rejectedCount = entries.filter(e => e.status === 'REJECTED').length;

    const acknowledgedAmount = entries
      .filter(e => e.status === 'ACKNOWLEDGED')
      .reduce((sum, e) => sum + (Number(e.totalAmount) || 0), 0);

    return { submittedCount, acknowledgedCount, rejectedCount, acknowledgedAmount };
  }, [entries]);

  const clearFilters = () => {
    setSearchTerm('');
    setSabhaFilter('all');
    setStatusFilter('all');
  };

  const handleRowClick = (row) => {
    // optional: open details later
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-card-foreground">
            All Entries - FY {selectedFY}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Dashboard shows entry-level rows. Export expands to member-wise rows.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadAllEntries} iconName="RefreshCw" iconPosition="left">
            Refresh
          </Button>

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
                <button
                  onClick={handleExportCsv}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                >
                  Export CSV
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Icon name="Clock" size={22} color="#f59e0b" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Submitted</h3>
          <p className="text-2xl font-bold text-card-foreground">{totals.submittedCount}</p>
        </div>

        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Icon name="CheckCircle2" size={22} color="#22c55e" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Acknowledged</h3>
          <p className="text-2xl font-bold text-card-foreground">{totals.acknowledgedCount}</p>
        </div>

        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <Icon name="XCircle" size={22} color="#ef4444" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Rejected</h3>
          <p className="text-2xl font-bold text-card-foreground">{totals.rejectedCount}</p>
        </div>

        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Icon name="IndianRupee" size={22} color="#a855f7" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Collected (Ack)</h3>
          <p className="text-2xl font-bold text-card-foreground">{formatCurrency(totals.acknowledgedAmount)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Input
              type="text"
              placeholder="Search by name, entry ID, receipt no, or sabha..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e?.target?.value)}
              iconName="Search"
              iconPosition="left"
            />
          </div>

          <div>
            <Select
              value={sabhaFilter}
              onChange={setSabhaFilter}
              options={sabhaOptions}
              placeholder="Filter by Sabha"
            />
          </div>

          <div>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
              placeholder="Filter by Status"
            />
          </div>
        </div>
      </div>

      {/* Results Summary */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {loading ? 'Loading…' : `Showing ${filteredEntries.length} of ${entries.length} entries`}
        </span>

        {(searchTerm || sabhaFilter !== 'all' || statusFilter !== 'all') && (
          <button onClick={clearFilters} className="text-primary hover:underline">
            Clear all filters
          </button>
        )}
      </div>

      {/* Error */}
      {loadError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
          Failed to load entries: {loadError}
        </div>
      )}

      {/* Entries Table (UNCHANGED: entry-level) */}
      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border bg-[#F97316] tracking-normal">
              <tr>
                <th className="text-left p-4 text-sm font-semibold text-card-foreground text-white">Sabha</th>
                <th className="text-left p-4 text-sm font-semibold text-card-foreground text-white">Payer Name</th>
                <th className="text-left p-4 text-sm font-semibold text-card-foreground text-white">Submitted Date</th>
                <th className="text-right p-4 text-sm font-semibold text-card-foreground text-white">Members</th>
                <th className="text-right p-4 text-sm font-semibold text-card-foreground text-white">Amount</th>
                <th className="text-left p-4 text-sm font-semibold text-card-foreground text-white">Status</th>
                <th className="text-left p-4 text-sm font-semibold text-card-foreground text-white">Receipt No</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-muted-foreground">
                    Loading entries…
                  </td>
                </tr>
              ) : filteredEntries.length > 0 ? (
                filteredEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => handleRowClick(entry)}
                    className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Icon name="MapPin" size={14} color="var(--color-muted-foreground)" />
                        <span className="text-card-foreground">{entry.sabha}</span>
                      </div>
                    </td>

                    <td className="p-4 font-medium text-card-foreground">{entry.payerName}</td>
                    <td className="p-4 text-muted-foreground">{formatDate(entry.submittedDate)}</td>
                    <td className="p-4 text-right text-card-foreground">{entry.membersCount}</td>
                    <td className="p-4 text-right font-semibold text-card-foreground">
                      {formatCurrency(entry.totalAmount)}
                    </td>
                    <td className="p-4">{getStatusBadge(entry.status)}</td>
                    <td className="p-4">
                      {entry.receiptNo ? (
                        <span className="font-mono text-sm text-primary font-medium">{entry.receiptNo}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="p-8 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Icon name="Search" size={32} color="var(--color-muted-foreground)" />
                      <p className="text-muted-foreground">No entries found matching your filters</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>

          </table>
        </div>
      </div>
    </div>
  );
};

export default AllEntriesTab;
