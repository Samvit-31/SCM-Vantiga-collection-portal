import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import CommonHeader from 'components/ui/CommonHeader';
import { supabase } from '../../supabaseClient';

// Utility: convert number to words (Indian numbering system)
const numberToWords = (num) => {
  if (!num || num === 0) return 'Zero';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  const ltThousand = (n) => {
    if (n === 0) return '';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) {
      const t = Math.floor(n / 10);
      const o = n % 10;
      return tens[t] + (o ? ` ${ones[o]}` : '');
    }
    const h = Math.floor(n / 100);
    const r = n % 100;
    return `${ones[h]} Hundred${r ? ` ${ltThousand(r)}` : ''}`;
  };

  if (num < 1000) return ltThousand(num);
  if (num < 100000) {
    const th = Math.floor(num / 1000);
    const r = num % 1000;
    return `${ltThousand(th)} Thousand${r ? ` ${ltThousand(r)}` : ''}`;
  }
  if (num < 10000000) {
    const l = Math.floor(num / 100000);
    const r = num % 100000;
    return `${ltThousand(l)} Lakh${r ? ` ${numberToWords(r)}` : ''}`;
  }
  const c = Math.floor(num / 10000000);
  const r = num % 10000000;
  return `${ltThousand(c)} Crore${r ? ` ${numberToWords(r)}` : ''}`;
};

const formatDate = (dateString) => {
  try {
    const d = dateString ? new Date(dateString) : new Date();
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
};

const getStandaloneFallback = () => ({
  receiptNo: 'PREVIEW-001',
  fy: '2025-26',
  paidBy: 'UPI',
  referenceNo: 'N/A',
  acknowledgedDate: new Date().toISOString(),
  family: {
    payerMobile: '9000000000',
    payerEmail: 'sample@example.com',
    addressMultiLine: 'Sample Address Line 1\nSample Address Line 2',
    sabha: 'Shirali',
    optShowAmountInDirectory: 'Yes',
    optShowMobileInDirectory: 'No',
    optShowEmailInDirectory: 'Yes'
  },
  members: [
    {
      memberId: '1',
      name: 'Sample Member',
      age: 35,
      gender: 'M',
      gotra: 'Kashyap',
      amount: 5000,
      isPrimaryPayer: true
    }
  ]
});

const mapDbEntryToReceiptEntry = (dbEntry, fallbackEntry = {}) => {
  const family = dbEntry?.families || {};
  const members = Array.isArray(family?.family_members) ? family.family_members : [];

  return {
    ...fallbackEntry,
    entryId: dbEntry?.id || fallbackEntry?.entryId || fallbackEntry?.id,
    id: dbEntry?.id || fallbackEntry?.id || fallbackEntry?.entryId,
    fy: dbEntry?.fy || fallbackEntry?.fy || '-',
    paidBy: dbEntry?.paid_by ?? '-',
    referenceNo: dbEntry?.reference_no ?? '',
    receiptNo: dbEntry?.receipt_no || fallbackEntry?.receiptNo || '-',
    submittedBy: dbEntry?.submitted_by || fallbackEntry?.submittedBy || fallbackEntry?.submitted_by || null,
    submitted_by: dbEntry?.submitted_by || fallbackEntry?.submitted_by || fallbackEntry?.submittedBy || null,
    acknowledgedBy: dbEntry?.acknowledged_by || fallbackEntry?.acknowledgedBy || fallbackEntry?.acknowledged_by || null,
    acknowledged_by: dbEntry?.acknowledged_by || fallbackEntry?.acknowledged_by || fallbackEntry?.acknowledgedBy || null,
    acknowledgedDate: dbEntry?.acknowledged_at || fallbackEntry?.acknowledgedDate || null,
    family: {
      ...(fallbackEntry?.family || {}),
      familyId: family?.id || fallbackEntry?.family?.familyId,
      addressMultiLine: family?.address_multiline || fallbackEntry?.family?.addressMultiLine || '-',
      payerMobile: family?.payer_mobile || fallbackEntry?.family?.payerMobile || '',
      payerEmail: family?.payer_email || fallbackEntry?.family?.payerEmail || '',
      sabha: family?.sabhas?.name || fallbackEntry?.family?.sabha || null,
      optShowAmountInDirectory:
        typeof family?.opt_show_amount_in_directory === 'boolean'
          ? (family.opt_show_amount_in_directory ? 'Yes' : 'No')
          : (fallbackEntry?.family?.optShowAmountInDirectory || 'No'),
      optShowMobileInDirectory:
        typeof family?.opt_show_mobile_in_directory === 'boolean'
          ? (family.opt_show_mobile_in_directory ? 'Yes' : 'No')
          : (fallbackEntry?.family?.optShowMobileInDirectory || 'No'),
      optShowEmailInDirectory:
        typeof family?.opt_show_email_in_directory === 'boolean'
          ? (family.opt_show_email_in_directory ? 'Yes' : 'No')
          : (fallbackEntry?.family?.optShowEmailInDirectory || 'No')
    },
    members: members.length
      ? members.map((m) => ({
          memberId: m?.id,
          name: m?.full_name || '-',
          age: m?.age,
          gender: m?.gender,
          gotra: m?.gotra,
          amount: Number(m?.amount || 0),
          isPrimaryPayer: !!m?.is_primary_payer
        }))
      : (Array.isArray(fallbackEntry?.members) ? fallbackEntry.members : [])
  };
};

const ReceiptPreview = ({ standalone = false }) => {
  const navigate = useNavigate();
  const logoUrl = new URL('../../../cropped-Math-Logo-Round.png', import.meta.url).href;
  const [entry, setEntry] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  // fetched from Supabase profiles (instead of email)
  const [pratinidhiName, setPratinidhiName] = useState('-');
  const [treasurerName, setTreasurerName] = useState('-');

  useEffect(() => {
    let isMounted = true;

    async function loadReceiptEntry() {
      const storedEntry = localStorage.getItem('selectedReceiptEntry');
      const storedProfile = localStorage.getItem('userProfile');

      if (!storedEntry) {
        if (standalone) {
          setEntry(getStandaloneFallback());
          setUserProfile({
            sabha: 'Shirali',
            name: 'Preview User'
          });
          return;
        }
        navigate('/sabha-dashboard', { replace: true });
        return;
      }

      try {
        const parsedEntry = JSON.parse(storedEntry);
        const parsedProfile = storedProfile ? JSON.parse(storedProfile) : null;

        if (!isMounted) return;
        setUserProfile(parsedProfile);

        const entryId = parsedEntry?.entryId || parsedEntry?.id;
        if (!entryId) {
          setEntry(parsedEntry);
          return;
        }

        const { data, error } = await supabase
          .from('vantiga_entries')
          .select(`
            id, fy, paid_by, reference_no, receipt_no, submitted_by, acknowledged_by, acknowledged_at,
            families:family_id (
              id,
              address_multiline,
              payer_mobile,
              payer_email,
              opt_show_amount_in_directory,
              opt_show_mobile_in_directory,
              opt_show_email_in_directory,
              sabhas:sabha_id ( name ),
              family_members (
                id, full_name, age, gender, gotra, amount, is_primary_payer
              )
            )
          `)
          .eq('id', entryId)
          .single();

        if (!isMounted) return;

        if (error || !data) {
          console.warn('Receipt fallback to local cache, Supabase fetch failed:', error);
          setEntry(parsedEntry);
          return;
        }

        setEntry(mapDbEntryToReceiptEntry(data, parsedEntry));
      } catch (e) {
        console.error('Error loading receipt data:', e);
        if (!isMounted) return;

        if (standalone) {
          setEntry(getStandaloneFallback());
          setUserProfile({
            sabha: 'Shirali',
            name: 'Preview User'
          });
          return;
        }
        navigate('/sabha-dashboard', { replace: true });
      }
    }

    loadReceiptEntry();

    return () => {
      isMounted = false;
    };
  }, [navigate, standalone]);

  // Load Pratinidhi full name from Supabase profiles
  useEffect(() => {
    async function loadPratinidhiName() {
      if (!entry) return;

      const submittedBy =
        entry?.submitted_by ||
        entry?.submittedBy ||
        entry?.submitted_by_user_id ||
        entry?.submittedByUserId ||
        null;

      let userIdToLookup = submittedBy;

      if (!userIdToLookup) {
        try {
          const { data: userData, error: userErr } = await supabase.auth.getUser();
          if (!userErr && userData?.user?.id) userIdToLookup = userData.user.id;
        } catch {
          // ignore
        }
      }

      if (!userIdToLookup && userProfile?.userId) userIdToLookup = userProfile.userId;

      if (!userIdToLookup) {
        setPratinidhiName('-');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', userIdToLookup)
        .single();

      if (!error && data?.full_name) {
        setPratinidhiName(data.full_name);
      } else {
        const fallback =
          userProfile?.name ||
          (userProfile?.email ? userProfile.email.split('@')[0] : '-');
        setPratinidhiName(fallback);
      }
    }

    loadPratinidhiName();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);

  // Load Treasurer full name from Supabase profiles (acknowledged_by)
  useEffect(() => {
    async function loadTreasurerName() {
      if (!entry) return;

      const acknowledgedBy =
        entry?.acknowledged_by ||
        entry?.acknowledgedBy ||
        null;

      if (!acknowledgedBy) {
        setTreasurerName('-');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', acknowledgedBy)
        .single();

      if (!error && data?.full_name) {
        setTreasurerName(data.full_name);
      } else {
        setTreasurerName('-');
      }
    }

    loadTreasurerName();
  }, [entry]);

  const handleBack = () => navigate('/sabha-dashboard');
  const handlePrint = () => window.print();

  const members = useMemo(() => (Array.isArray(entry?.members) ? entry.members : []), [entry]);
  const primaryPayer = useMemo(() => members.find((m) => m?.isPrimaryPayer) || null, [members]);
  const primaryPayerName = useMemo(
    () => primaryPayer?.name || members?.[0]?.name || '-',
    [primaryPayer, members]
  );

  if (!entry) return null;

  const totalAmount = members.reduce((sum, m) => sum + (Number(m?.amount) || 0), 0);
  const amountInWords = numberToWords(totalAmount);

  const receiptDate = entry?.acknowledgedDate ? formatDate(entry.acknowledgedDate) : formatDate(new Date().toISOString());

  const paidBy = String(entry?.paidBy || '').trim() || '-';
  const referenceNoRaw = String(entry?.referenceNo ?? '').trim();
  const referenceNo = referenceNoRaw || (paidBy === 'Cash' ? 'Not Applicable' : '-');

  const payerMobile = entry?.family?.payerMobile ? `+91 ${entry.family.payerMobile}` : '-';
  const payerEmail = entry?.family?.payerEmail || '-';
  const address = entry?.family?.addressMultiLine || '-';

  const collectingSabha = userProfile?.sabha
    ? userProfile.sabha
    : `${entry?.family?.sabha || '-'}`;

  const optShowAmount = entry?.family?.optShowAmountInDirectory || 'No';
  const optShowMobile = entry?.family?.optShowMobileInDirectory || 'No';
  const optShowEmail = entry?.family?.optShowEmailInDirectory || 'No';
  const tableRows = [...members, ...Array(Math.max(0, 5 - members.length)).fill(null)];

  return (
    <div className="min-h-screen bg-background">
      <style>{`
        @page {
          size: A4 portrait;
          margin: 12mm;
        }
        @media screen {
          .receipt-sheet {
            width: 186mm;
            min-height: 273mm;
          }
        }
        @media print {
          .receipt-sheet {
            width: 186mm;
            min-height: 273mm;
            margin: 0 auto;
          }
          .receipt-sheet,
          .receipt-sheet * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
      {/* Common Header */}
      <div className={`print:hidden ${standalone ? 'hidden' : ''}`}>
        <CommonHeader />
      </div>

      <div className="min-h-screen bg-gray-50 print:bg-white text-slate-900">
        {/* Controls (hidden in print) */}
        <div className="print:hidden bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <Button variant="outline" onClick={handleBack} iconName="ArrowLeft" iconPosition="left">
              Back to Dashboard
            </Button>
            <Button variant="default" onClick={handlePrint} iconName="Printer" iconPosition="left">
              Print
            </Button>
          </div>
        </div>

        {/* Receipt */}
        <div className="container mx-auto px-4 py-8 print:py-0">
          <div className="receipt-sheet w-full max-w-full mx-auto bg-white border border-gray-300 shadow-sm print:shadow-none text-sm">
            <div className="px-6 pt-4 pb-3 border-b border-slate-300">
              <div className="flex items-start justify-between gap-3">
                <img src={logoUrl} alt="SCM Vantiga Portal" className="w-14 h-14 rounded-full mt-1" />
                <div className="text-center flex-1">
                  <div className="text-xl leading-tight font-bold uppercase tracking-wide">
                    Shri Chitrapur Math
                  </div>
                  <div className="text-base leading-tight font-semibold mt-1">
                    Chitrapur, Shirali, Uttara Kannada Dist. Karnataka - 581354
                  </div>
                  <div className="text-sm leading-tight font-semibold mt-1">
                    Email:accts.shirali@chitrapurmath.in
                    <span className="inline-block ml-6">GSTN:29AAATS5030Q1Z0</span>
                  </div>
                </div>
                <div className="w-14" />
              </div>
            </div>

            <div className="px-6 py-2.5 border-b border-slate-300 flex items-start justify-between">
              <div>
                <div className="text-lg font-bold">Digital Vantiga Receipt</div>
                <div className="text-sm font-semibold mt-0.5">Collecting Local Sabha: {collectingSabha}</div>
              </div>
              <div className="text-sm leading-tight text-right font-semibold">
                <div>
                  Receipt number:{' '}
                  <span className="font-mono">{entry?.receiptNo || '-'}</span>
                </div>
                <div>
                  Date: <span className="font-medium">{receiptDate}</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-2.5 text-base font-semibold">
              Received From : <span className="font-normal">{primaryPayerName}</span>
            </div>

            <div className="px-6 pb-2">
              <div className="border border-slate-300 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-300">
                      <th className="text-left px-3 py-2 w-[41%]">Name</th>
                      <th className="text-left px-3 py-2 w-[10%]">Age</th>
                      <th className="text-left px-3 py-2 w-[14%]">Gender</th>
                      <th className="text-left px-3 py-2 w-[15%]">Gotra</th>
                      <th className="text-center px-3 py-2 w-[20%]">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((m, idx) => (
                      <tr key={m?.memberId || `blank-${idx}`} className="border-b border-slate-200">
                        <td className="px-3 py-2">{m?.name || ''}</td>
                        <td className="px-3 py-2">{m?.age ?? ''}</td>
                        <td className="px-3 py-2">{m?.gender ?? ''}</td>
                        <td className="px-3 py-2">{m?.gotra ?? ''}</td>
                        <td className="px-3 py-2 text-right">{m ? Number(m?.amount || 0).toLocaleString('en-IN') : ''}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td colSpan={4} className="px-3 py-2 text-right">TOTAL</td>
                      <td className="px-3 py-2 text-right">{totalAmount.toLocaleString('en-IN')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-1.5 text-base font-semibold">
                AMOUNT IN WORDS: <span className="font-medium"> Rupees</span>
                <span className="italic font-medium">{amountInWords}</span>
                <span className="font-medium"> Only</span>
              </div>
            </div>

            <div className="border-t border-slate-300 px-6 py-2">
              <div className="text-base font-semibold">Address:</div>
              <div className="text-sm whitespace-pre-line leading-snug">{address}</div>
            </div>

            <div className="border-t border-slate-300 px-6 py-2">
              <div className="text-base font-semibold">
                Mobile Number: <span className="text-sm font-mono font-normal">{payerMobile}</span>
              </div>
            </div>

            <div className="border-t border-slate-300 px-6 py-2">
              <div className="text-base font-semibold">
                Email ID: <span className="text-sm break-all font-mono font-normal">{payerEmail}</span>
              </div>
            </div>

            <div className="border-t border-slate-300 px-6 py-2.5">
              <div className="text-sm mb-1.5">
                <span className="font-semibold">Payment Mode:</span>{' '}
                <span className="font-mono">{paidBy}</span>
              </div>
              <div className="text-sm">
                <span className="font-semibold">Reference Number:</span>{' '}
                <span className="font-mono">{referenceNo}</span>
              </div>
            </div>

            <div className="border-t border-slate-300 px-6 py-2">
              <div className="text-base font-semibold">
                Vantiga for year: <span className="text-sm font-mono font-normal">{entry?.fy || '-'}</span>
              </div>
            </div>

            <div className="border-t border-slate-300 px-6 py-2.5 bg-slate-100">
              <div className="text-base font-semibold mb-2">Opt to Show in Vantiga Directory:</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm mb-2.5">
                <div>
                  <span className="font-semibold">Vantiga Amount:</span> {optShowAmount}
                </div>
                <div>
                  <span className="font-semibold">Mobile Number:</span> {optShowMobile}
                </div>
                <div>
                  <span className="font-semibold">Email ID:</span> {optShowEmail}
                </div>
              </div>
              <div className="inline-block text-sm font-semibold bg-yellow-200 px-2 py-1 rounded">
                Consent Statement comes here. To be vetted/provided by legal team
              </div>
            </div>

            <div className="border-t border-slate-300 px-6 py-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                <div>
                  <div className="font-semibold">Pratinidhi Name:</div>
                  <div className="mt-1">{pratinidhiName}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">Treasurer Name:</div>
                  <div className="mt-1">{treasurerName}</div>
                </div>
              </div>
            </div>

            <div className="px-6 pb-3 pt-1 text-center">
              <div className="text-[11px] text-slate-600 font-medium print:text-[10px]">
                No Signature required as this is a computer generated receipt
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReceiptPreview;
