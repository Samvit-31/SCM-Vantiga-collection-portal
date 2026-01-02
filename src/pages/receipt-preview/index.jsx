import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import CommonHeader from 'components/ui/CommonHeader';
import { supabase } from '../../supabaseClient'; // ✅ adjust path if needed

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

const ReceiptPreview = () => {
  const navigate = useNavigate();
  const [entry, setEntry] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  // ✅ fetched from Supabase profiles (instead of email)
  const [pratinidhiName, setPratinidhiName] = useState('—');

  useEffect(() => {
    const storedEntry = localStorage.getItem('selectedReceiptEntry');
    const storedProfile = localStorage.getItem('userProfile');

    if (!storedEntry) {
      navigate('/sabha-dashboard', { replace: true });
      return;
    }

    try {
      setEntry(JSON.parse(storedEntry));
      setUserProfile(storedProfile ? JSON.parse(storedProfile) : null);
    } catch (e) {
      console.error('Error parsing receipt data:', e);
      navigate('/sabha-dashboard', { replace: true });
    }
  }, [navigate]);

  // ✅ Load Pratinidhi full name from Supabase profiles
  useEffect(() => {
    async function loadPratinidhiName() {
      if (!entry) return;

      // Prefer: the pratinidhi who submitted this entry (if available)
      const submittedBy =
        entry?.submitted_by ||
        entry?.submittedBy ||
        entry?.submitted_by_user_id ||
        entry?.submittedByUserId ||
        null;

      // Fallback: if not present in stored entry, use current logged-in user id
      let userIdToLookup = submittedBy;

      if (!userIdToLookup) {
        try {
          const { data: userData, error: userErr } = await supabase.auth.getUser();
          if (!userErr && userData?.user?.id) userIdToLookup = userData.user.id;
        } catch {
          // ignore
        }
      }

      // Final fallback: userProfile.userId if you store it
      if (!userIdToLookup && userProfile?.userId) userIdToLookup = userProfile.userId;

      if (!userIdToLookup) {
        setPratinidhiName('—');
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
        // fallback: if profile missing, show email prefix if available
        const fallback =
          userProfile?.name ||
          (userProfile?.email ? userProfile.email.split('@')[0] : '—');
        setPratinidhiName(fallback);
      }
    }

    loadPratinidhiName();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);

  const handleBack = () => navigate('/sabha-dashboard');
  const handlePrint = () => window.print();

  const members = useMemo(() => (Array.isArray(entry?.members) ? entry.members : []), [entry]);
  const headMember = useMemo(() => members?.[0] || null, [members]);
  const headName = useMemo(() => headMember?.name || '—', [headMember]);

  if (!entry) return null;

  const totalAmount = members.reduce((sum, m) => sum + (Number(m?.amount) || 0), 0);
  const amountInWords = numberToWords(totalAmount);

  const receiptDate = entry?.acknowledgedDate ? formatDate(entry.acknowledgedDate) : formatDate(new Date().toISOString());

  const paidBy = entry?.paidBy || '—';
  const referenceNo = entry?.referenceNo || '—';

  const payerMobile = entry?.family?.payerMobile ? `+91 ${entry.family.payerMobile}` : '—';
  const payerEmail = entry?.family?.payerEmail || '—';
  const address = entry?.family?.addressMultiLine || '—';

  const collectingSabha = userProfile?.sabha
    ? `${userProfile.sabha} Local Sabha`
    : `${entry?.family?.sabha || '—'} Local Sabha`;

  const optShowAmount = entry?.family?.optShowAmountInDirectory || 'No';
  const optShowMobile = entry?.family?.optShowMobileInDirectory || 'No';
  const optShowEmail = entry?.family?.optShowEmailInDirectory || 'No';

  return (
    <div className="min-h-screen bg-background">
      {/* Common Header */}
      <div className="print:hidden">
        <CommonHeader />
      </div>

      <div className="min-h-screen bg-gray-50 print:bg-white">
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
          <div className="max-w-5xl mx-auto bg-white border border-gray-300 shadow-sm print:shadow-none">
            {/* Top line */}
            <div className="px-6 pt-6">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Icon name="Building2" size={18} />
                <span>Shri Chitrapur Math, Shirali, Uttara Kannada, Karnataka</span>
              </div>
            </div>

            {/* Header row */}
            <div className="px-6 pb-4 pt-3 border-b border-gray-300 flex items-start justify-between">
              <div className="text-lg font-bold">Digital Vantiga Receipt</div>
              <div className="text-sm text-right">
                <div>
                  <span className="font-semibold">Receipt No</span>{' '}
                  <span className="font-mono">{entry?.receiptNo || '—'}</span>
                </div>
                <div>
                  <span className="font-semibold">Date</span> {receiptDate}
                </div>
              </div>
            </div>

            {/* Two-column layout */}
            <div className="px-6 py-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* LEFT */}
              <div className="md:col-span-2">
                {/* Received From */}
                <div className="mb-4">
                  <div className="text-sm font-semibold mb-2">Received From :</div>

                  <div className="border border-gray-300 rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 border-b border-gray-300">
                        <tr>
                          <th className="text-left px-3 py-2">Name</th>
                          <th className="text-left px-3 py-2">Age</th>
                          <th className="text-left px-3 py-2">Gender</th>
                          <th className="text-left px-3 py-2">Gotra</th>
                          <th className="text-right px-3 py-2">Total Amt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m, idx) => (
                          <tr key={m?.memberId || idx} className="border-b border-gray-200">
                            {/* ✅ Show actual first-entered name (no "Self 1") */}
                            <td className="px-3 py-2">{m?.name || '—'}</td>
                            <td className="px-3 py-2">{m?.age ?? '—'}</td>
                            <td className="px-3 py-2">{m?.gender ?? '—'}</td>
                            <td className="px-3 py-2">{m?.gotra ?? '—'}</td>
                            <td className="px-3 py-2 text-right">{Number(m?.amount || 0).toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 font-semibold border-t border-gray-300">
                          <td colSpan={4} className="px-3 py-2 text-right">TOTAL</td>
                          <td className="px-3 py-2 text-right">{totalAmount.toLocaleString('en-IN')}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="mt-2 text-sm">
                    <span className="font-semibold">(IN WORDS Received Rupees </span>
                    <span className="italic">{amountInWords}</span>
                    <span className="font-semibold"> Only)</span>
                  </div>
                </div>

                {/* Paid By + Ref */}
                <div className="mt-4 text-sm">
                  <div className="mb-2">
                    <span className="font-semibold">Paid By : Cash/ Cheque/ NEFT/ Online/ UPI:</span>{' '}
                    <span className="font-mono">{paidBy}</span>
                  </div>
                  <div>
                    <span className="font-semibold">Chq./ Ref No:</span>{' '}
                    <span className="font-mono">{referenceNo}</span>
                  </div>
                </div>

                {/* Footer names */}
                <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
                  <div>
                    <div className="font-semibold">Prathinidhi Name</div>
                    {/* ✅ Supabase profiles.full_name */}
                    <div>{pratinidhiName}</div>
                  </div>

                  <div className="text-right">
                    {/* ✅ Replace Receiver Name with Received from: Head name */}
                    <div className="font-semibold">Received from:</div>
                    <div>{headName}</div>
                  </div>
                </div>

                <div className="mt-4 text-sm">
                  No Signature required as this is a computer generated receipt
                </div>
              </div>

              {/* RIGHT */}
              <div className="md:col-span-1 space-y-4">
                {/* Opt to show amount */}
                <div className="text-sm">
                  <div className="font-semibold">Opt to show in Vantiga Directory</div>
                  <div className="mt-1 flex items-center justify-between">
                    <div className="text-gray-600">Amount</div>
                    <div className="font-mono">{optShowAmount}</div>
                  </div>
                </div>

                {/* Collecting Sabha */}
                <div className="text-sm">
                  <div className="font-semibold">Collecting Local Sabha: (dropdown)</div>
                  <div className="mt-1">{collectingSabha}</div>
                </div>

                {/* Vantiga Year */}
                <div className="text-sm">
                  <div className="font-semibold">Vantiga for Year:</div>
                  <div className="mt-1 font-mono">{entry?.fy || '—'}</div>
                </div>

                {/* Address */}
                <div className="text-sm">
                  <div className="font-semibold">Address:</div>
                  <div className="mt-1 whitespace-pre-line">{address}</div>
                </div>

                {/* Mobile + opt */}
                <div className="text-sm">
                  <div className="font-semibold">Mobile Number of Vantiga Payer:</div>
                  <div className="mt-1 font-mono">{payerMobile}</div>
                  <div className="mt-1 flex items-center justify-between">
                    <div className="text-gray-600">Opt to show Mobile number in Vantiga Directory</div>
                    <div className="font-mono">{optShowMobile}</div>
                  </div>
                </div>

                {/* Email + opt */}
                <div className="text-sm">
                  <div className="font-semibold">Email ID of Vantiga Payer:</div>
                  <div className="mt-1 break-all font-mono">{payerEmail}</div>
                  <div className="mt-1 flex items-center justify-between">
                    <div className="text-gray-600">Opt to show Email ID in Vantiga Directory</div>
                    <div className="font-mono">{optShowEmail}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom line */}
            <div className="px-6 pb-6">
              <div className="text-center text-xs text-gray-600">
                Shri Chitrapur Math, Shirali, Uttara Kannada, Karnataka
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReceiptPreview;
