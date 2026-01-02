import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import Icon from '../../components/AppIcon';
import CommonHeader from '../../components/ui/CommonHeader';
import EntriesList from './components/EntriesList';
import SummaryView from './components/SummaryView';

// ✅ adjust import path to where your client lives
import { supabase } from '../../supabaseClient';

async function getUserSabhaContextOrThrow() {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;

  const uid = userData?.user?.id;
  if (!uid) throw new Error('No active session. Please login again.');

  const { data: rows, error } = await supabase
    .from('user_sabha_roles')
    .select(`
      role,
      sabha_id,
      sabhas:sabha_id ( id, code, name )
    `)
    .eq('user_id', uid)
    .eq('is_active', true);

  if (error) throw error;
  if (!rows || rows.length === 0) {
    throw new Error('Sabha is not mapped to your user. Please contact admin.');
  }

  const pratinidhiRow = rows.find(r => r.role === 'pratinidhi') || rows[0];

  return {
    userId: uid,
    role: pratinidhiRow.role,
    sabhaId: pratinidhiRow.sabha_id,
    sabhaName: pratinidhiRow.sabhas?.name,
    sabhaCode: pratinidhiRow.sabhas?.code,
  };
}

const SabhaDashboard = () => {
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState(null);
  const [selectedFY, setSelectedFY] = useState('2025-26');
  const [activeTab, setActiveTab] = useState('entries');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const exportRef = useRef(null);
  const entriesExportRef = useRef(null);
  const summaryExportRef = useRef(null);

  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [entriesError, setEntriesError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
      if (!isAuthenticated) {
        navigate('/login', { replace: true });
        return;
      }

      const profile = JSON.parse(localStorage.getItem('userProfile') || '{}');

      if (profile?.role === 'scm_office') {
        navigate('/scm-office-dashboard', { replace: true });
        return;
      }

      let nextProfile = profile;

      try {
        const ctx = await getUserSabhaContextOrThrow();
        nextProfile = {
          ...profile,
          role: ctx?.role || profile?.role,
          sabhaId: ctx?.sabhaId || profile?.sabhaId,
          sabha: ctx?.sabhaName || profile?.sabha,
        };

        localStorage.setItem('userProfile', JSON.stringify(nextProfile));
        if (ctx?.sabhaId) {
          localStorage.setItem('sabha_id', ctx.sabhaId);
        }
      } catch (err) {
        console.warn('Failed to load sabha role mapping:', err);
      }

      if (!isMounted) return;
      setUserProfile(nextProfile);
    };

    init();
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const fyOptions = [
    { value: '2023-24', label: '2023-24' },
    { value: '2024-25', label: '2024-25' },
    { value: '2025-26', label: '2025-26' }
  ];

  const handleFYChange = (value) => setSelectedFY(value);

  const handleNewEntry = () => {
    navigate('/new-entry-form');
  };

  const handleExportPdf = () => {
    setIsExportOpen(false);
    if (activeTab === 'entries') {
      entriesExportRef.current?.exportEntriesPdf?.();
      return;
    }
    summaryExportRef.current?.exportSummaryPdf?.();
  };

  const handleExportCsv = () => {
    setIsExportOpen(false);
    entriesExportRef.current?.exportEntriesCsv?.();
  };

  // ✅ Fetch entries from Supabase (single source of truth)
  const fetchEntries = useCallback(async () => {
    if (!userProfile?.sabhaId || !selectedFY) return;

    setLoadingEntries(true);
    setEntriesError(null);

    try {
      const { data, error } = await supabase
        .from('vantiga_entries')
        .select(`
          id, fy, status, paid_by, reference_no, receipt_no,
          submitted_at, acknowledged_at, rejection_reason,
          sabha_id, family_id,
          families (
            id, sabha_id, family_code, address_multiline, payer_mobile, payer_email,
            opt_show_amount_in_directory, opt_show_mobile_in_directory, opt_show_email_in_directory,
            family_members (
              id, full_name, age, gender, gotra, amount, is_primary_payer
            )
          )
        `)
        .eq('sabha_id', userProfile.sabhaId)
        .eq('fy', selectedFY)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (e) {
      console.error('Failed to load entries', e);
      setEntriesError(e?.message || 'Failed to load entries');
      setEntries([]);
    } finally {
      setLoadingEntries(false);
    }
  }, [userProfile?.sabhaId, selectedFY]);

  // Load entries on FY/sabha change
  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

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

  // ✅ Realtime: auto-refresh list when entries change
  useEffect(() => {
    if (!userProfile?.sabhaId || !selectedFY) return;

    const channel = supabase.channel(`vantiga_entries_${userProfile.sabhaId}_${selectedFY}`);

    channel
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT/UPDATE/DELETE
          schema: 'public',
          table: 'vantiga_entries',
          filter: `sabha_id=eq.${userProfile.sabhaId}`
        },
        (payload) => {
          // Only refetch when the FY matches (payload.new exists for INSERT/UPDATE)
          const newRow = payload?.new;
          const oldRow = payload?.old;

          const fyChangedOrMatches =
            (newRow && newRow.fy === selectedFY) ||
            (oldRow && oldRow.fy === selectedFY);

          if (fyChangedOrMatches) {
            fetchEntries();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userProfile?.sabhaId, selectedFY, fetchEntries]);

  // Keep parent entries in sync if child updates (optional)
  const handleEntriesUpdate = (updatedEntries) => {
    setEntries(updatedEntries);
  };

  const roleLabel = userProfile?.role === 'treasurer' ? 'Treasurer' : 'Pratinidhi';
  const sabhaLineParts = [];
  if (userProfile?.sabha) sabhaLineParts.push(userProfile.sabha);
  sabhaLineParts.push(roleLabel);
  const sabhaLine = sabhaLineParts.join(' • ');

  if (!userProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-muted-foreground">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <CommonHeader />

      <div className="bg-card border-b border-border shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold text-card-foreground mb-2">
                Sabha Dashboard
              </h2>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon name="MapPin" size={16} />
                <p className="text-sm">
                  {sabhaLine}
                </p>
              </div>
            </div>

            <div className="w-48">
              <Select
                value={selectedFY}
                onChange={handleFYChange}
                options={fyOptions}
                label="Financial Year"
                placeholder="Select FY"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 bg-muted p-1 rounded-md">
              <button
                onClick={() => setActiveTab('entries')}
                className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                  activeTab === 'entries'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Entries
              </button>
              <button
                onClick={() => setActiveTab('summary')}
                className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                  activeTab === 'summary'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Summary
              </button>
            </div>

            {userProfile?.role === 'pratinidhi' && (
              <Button
                variant="outline"
                size="default"
                onClick={handleNewEntry}
                iconName="Plus"
                iconPosition="left"
                className= "bg-[#F97316] text-white"
              >
                New Entry
              </Button>
            )}
            {userProfile?.role === 'treasurer' && (
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
                    {activeTab === 'entries' && (
                      <button
                        onClick={handleExportCsv}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                      >
                        Export CSV
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        {activeTab === 'entries' && (
          <>
            {entriesError && (
              <div className="mb-4 p-3 rounded border border-red-300 text-red-700">
                {entriesError}
              </div>
            )}
            <EntriesList
              ref={entriesExportRef}
              selectedFY={selectedFY}
              userRole={userProfile?.role}
              sabhaId={userProfile?.sabhaId}
              sabhaCode={userProfile?.sabhaCode}
              onEntriesUpdate={handleEntriesUpdate}
            />

          </>
        )}

        {activeTab === 'summary' && (
          <SummaryView
            ref={summaryExportRef}
            selectedFY={selectedFY}
            userProfile={userProfile}
            entries={entries} // ✅ summary uses same supabase-backed entries
          />
        )}
      </main>
    </div>
  );
};

export default SabhaDashboard;
