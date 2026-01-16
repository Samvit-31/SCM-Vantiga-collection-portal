import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import Icon from '../../components/AppIcon';
import CommonHeader from '../../components/ui/CommonHeader';
import OverviewTab from './components/OverviewTab';
import SabhaComparisonTab from './components/SabhaComparisonTab';
import AllEntriesTab from './components/AllEntriesTab';
import OfficeRemittancesTab from './components/OfficeRemittancesTab';

// ✅ ADD THIS:
import SummaryTab from './components/SummaryTab';

const ScmOfficeDashboard = () => {
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState(null);
  const [selectedFY, setSelectedFY] = useState('2025-26');

  // ✅ optionally make Summary default:
  // const [activeTab, setActiveTab] = useState('summary');
  const [activeTab, setActiveTab] = useState('overview');

  const [isAccessDenied, setIsAccessDenied] = useState(false);

  useEffect(() => {
    const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }

    const profile = JSON.parse(localStorage.getItem('userProfile') || '{}');

    if (profile?.role !== 'scm_office') {
      setIsAccessDenied(true);
      return;
    }

    setUserProfile(profile);
  }, [navigate]);

  const fyOptions = [
    { value: '2023-24', label: '2023-24' },
    { value: '2024-25', label: '2024-25' },
    { value: '2025-26', label: '2025-26' }
  ];

  const handleFYChange = (value) => {
    setSelectedFY(value);
  };

  const handleGoToSabhaDashboard = () => {
    navigate('/sabha-dashboard', { replace: true });
  };

  if (isAccessDenied) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-lg shadow-lg elevation-lg p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-destructive/10 rounded-full mb-4">
              <Icon name="ShieldAlert" size={32} color="var(--color-destructive)" />
            </div>
            <h1 className="text-2xl font-semibold text-card-foreground mb-2">
              Access Denied
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              You do not have permission to access the SCM Office Dashboard. This page is restricted to SCM office personnel only.
            </p>
            <Button
              variant="default"
              onClick={handleGoToSabhaDashboard}
              iconName="ArrowLeft"
              iconPosition="left"
            >
              Go to Sabha Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
                SCM Office Dashboard (Shirali)
              </h2>
              <div className="flex items-center gap-2 text-muted-foreground">
                <p className="text-sm">
                  Consolidated view across all Sabhas
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

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-muted p-1 rounded-md">
            {/* ✅ ADD SUMMARY TAB BUTTON */}
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

            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                activeTab === 'overview'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('sabha-comparison')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                activeTab === 'sabha-comparison'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sabha-Wise Comparison
            </button>
            <button
              onClick={() => setActiveTab('all-entries')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                activeTab === 'all-entries'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Entries
            </button>
            <button
              onClick={() => setActiveTab('remittances')}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                activeTab === 'remittances'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Remittances
            </button>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        {/* ✅ SUMMARY TAB */}
        {activeTab === 'summary' && (
          <SummaryTab selectedFY={selectedFY} />
        )}

        {activeTab === 'overview' && (
          <OverviewTab selectedFY={selectedFY} />
        )}

        {activeTab === 'sabha-comparison' && (
          <SabhaComparisonTab selectedFY={selectedFY} />
        )}

        {activeTab === 'all-entries' && (
          <AllEntriesTab selectedFY={selectedFY} />
        )}

        {activeTab === 'remittances' && (
          <OfficeRemittancesTab selectedFY={selectedFY} userProfile={userProfile} />
        )}
      </main>
    </div>
  );
};

export default ScmOfficeDashboard;
