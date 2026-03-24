import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Icon from '../../components/AppIcon';
import CommonHeader from '../../components/ui/CommonHeader';
import {
  getCurrentFinancialYear,
  getFinancialYearOptions,
  isValidFinancialYear
} from '../../utils/financialYear';
import { formatReceiptNumber } from '../../utils/receiptNumber';

// ✅ ADD: Supabase client
import { supabase } from "../../supabaseClient";


export async function getUserSabhaContextOrThrow() {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;

  const uid = userData?.user?.id;
  if (!uid) throw new Error("No active session. Please login again.");

  const { data: rows, error } = await supabase
    .from("user_sabha_roles")
    .select(`
      role,
      sabha_id,
      sabhas:sabha_id ( id, code, receipt_code, name )
    `)
    .eq("user_id", uid)
    .eq("is_active", true);

  if (error) throw error;

  if (!rows || rows.length === 0) {
    throw new Error("Sabha is not mapped to your user. Please contact admin.");
  }

  // If multiple roles exist, prefer pratinidhi for New Entry
  const pratinidhiRow = rows.find(r => r.role === "pratinidhi") || rows[0];

  return {
    userId: uid,
    role: pratinidhiRow.role,
    sabhaId: pratinidhiRow.sabha_id,
    sabhaName: pratinidhiRow.sabhas?.name,
    sabhaCode: pratinidhiRow.sabhas?.code,
    receiptCode: pratinidhiRow.sabhas?.receipt_code,
  };
}


const NewEntryForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const MAX_ADDITIONAL_MEMBERS = 2;
  const fyOptions = useMemo(() => getFinancialYearOptions(), []);
  const [entryFY, setEntryFY] = useState(getCurrentFinancialYear());

  // Form state - removed familyId, updated opt-in defaults to "Yes"
  const [formData, setFormData] = useState({
    entryType: 'Vantiga',
    sabha: '',
    address: '',
    payerMobile: '',
    payerEmail: '',
    optShowAmountInDirectory: 'Yes',
    optShowMobileInDirectory: 'Yes',
    optShowEmailInDirectory: 'Yes',
    paidBy: 'Cash',
    referenceNo: '',
  });

  // Members state - updated with firstName/lastName
  const [members, setMembers] = useState([
    {
      id: 1,
      firstName: '',
      lastName: '',
      age: '',
      gender: 'Male',
      gotra: '',
      amount: '',
      relationship: 'Member'
    }
  ]);

  const [errors, setErrors] = useState({});
  const [touchedFields, setTouchedFields] = useState({});

  // Duplicate warnings
  const [duplicateWarnings, setDuplicateWarnings] = useState([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);

  // ---------
  // IMPORTANT ASSUMPTIONS ABOUT YOUR DATABASE (based on your existing fetchEntriesForSabhaFY):
  // 1) vantiga_entries table has: id, fy, status, paid_by, reference_no, receipt_no, submitted_at, ...
  // 2) vantiga_entries has columns: sabha_id (uuid), family_id (uuid)
  // 3) families table has: id, address_multiline, payer_mobile, payer_email,
  //    opt_show_amount_in_directory, opt_show_mobile_in_directory, opt_show_email_in_directory
  // 4) family_members table has: id, family_id (uuid), full_name, age, gender, gotra, amount, is_primary_payer
  // 5) userProfile in localStorage contains: role, sabha, sabhaId (uuid)
  // ---------

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
      if (!isAuthenticated) {
        navigate('/login', { replace: true });
        return;
      }

      const profile = JSON.parse(localStorage.getItem('userProfile') || '{}');

      // Check role-based access
      if (profile?.role === 'treasurer') {
        toast?.error('Access denied. Only Pratinidhi can create new entries.');
        setTimeout(() => {
          navigate('/sabha-dashboard', { replace: true });
        }, 2000);
        return;
      }

      if (profile?.role === 'scm_office') {
        navigate('/scm-office-dashboard', { replace: true });
        return;
      }

      let nextProfile = profile;

      // Ensure sabha mapping exists (fallback to Supabase mapping if missing in localStorage)
      if (!profile?.sabhaId || !profile?.sabha) {
        try {
          const ctx = await getUserSabhaContextOrThrow();
          nextProfile = {
            ...profile,
            role: profile?.role || ctx?.role,
            sabhaId: ctx?.sabhaId || profile?.sabhaId,
            sabha: ctx?.sabhaName || profile?.sabha,
          };

          localStorage.setItem('userProfile', JSON.stringify(nextProfile));
          if (ctx?.sabhaId) {
            localStorage.setItem('sabha_id', ctx.sabhaId);
          }
        } catch (err) {
          toast?.error(err?.message || 'Failed to load sabha mapping.');
        }
      }

      if (!isMounted) return;

      setUserProfile(nextProfile);

      // Set default sabha name from user profile (UI-only)
      if (nextProfile?.sabha) {
        setFormData(prev => ({ ...prev, sabha: nextProfile?.sabha }));
      }

      setLoading(false);
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  useEffect(() => {
    const prefillFY = location?.state?.prefillFY;
    if (isValidFinancialYear(prefillFY, fyOptions)) {
      setEntryFY(prefillFY);
      return;
    }

    if (!isValidFinancialYear(entryFY, fyOptions) && fyOptions?.length > 0) {
      setEntryFY(fyOptions[fyOptions.length - 1].value);
    }
  }, [location?.state?.prefillFY, fyOptions]);

  const isMathMaryada = formData?.entryType === 'Math Maryada';

  // -----------------------
  // DUPLICATE CHECK (UPDATED): Now reads from Supabase, NOT localStorage.
  // This remains non-blocking (warning only), same as your existing behavior.
  // -----------------------
  useEffect(() => {
    const member1 = members?.[0];
    const totalAmount = calculateTotalAmount();

    if (
      member1?.firstName?.trim() &&
      member1?.lastName?.trim() &&
      totalAmount > 0 &&
      formData?.sabha &&
      userProfile?.sabhaId // need sabhaId for DB filtering
    ) {
      checkForDuplicates();
    } else {
      setDuplicateWarnings([]);
      setShowDuplicateWarning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    members?.[0]?.firstName,
    members?.[0]?.lastName,
    members?.map(m => m?.amount)?.join(','),
    formData?.payerMobile,
    formData?.payerEmail,
    formData?.referenceNo,
    formData?.paidBy,
    formData?.entryType,
    formData?.sabha,
    userProfile?.sabhaId,
    entryFY,
  ]);

  // ✅ FY helper (you can later calculate FY dynamically)
  const resolveReceiptCode = async () => {
    if (userProfile?.receiptCode) return userProfile.receiptCode;

    const cachedProfile = JSON.parse(localStorage.getItem('userProfile') || '{}');
    if (cachedProfile?.receiptCode) return cachedProfile.receiptCode;
    if (cachedProfile?.sabhaCode) return cachedProfile.sabhaCode;

    if (!userProfile?.sabhaId) return 'SABHA';

    const { data, error } = await supabase
      .from('sabhas')
      .select('receipt_code, code')
      .eq('id', userProfile.sabhaId)
      .single();

    if (error) {
      console.warn('Failed to resolve receipt code for receipt number:', error);
      return 'SABHA';
    }

    return data?.receipt_code || data?.code || 'SABHA';
  };

  const generateReceiptNumberForCashEntry = async (fy) => {
    const receiptCode = await resolveReceiptCode();

    const { count, error } = await supabase
      .from('vantiga_entries')
      .select('id', { count: 'exact', head: true })
      .eq('sabha_id', userProfile?.sabhaId)
      .eq('fy', fy)
      .not('receipt_no', 'is', null);

    if (error) throw error;

    const nextNumber = Number(count || 0) + 1;
    return formatReceiptNumber(receiptCode, nextNumber);
  };

  const checkForDuplicates = async () => {
    try {
      // NOTE:
      // Your EntriesList duplicate logic used:
      // - same sabha + same FY
      // - reference match OR (mobile/email + same total amount within 14 days)
      // We'll implement something similar here.

      const totalAmount = calculateTotalAmount();
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      // Fetch recent entries in the same sabha+FY (limit to last ~14 days for efficiency)
      const { data, error } = await supabase
        .from("vantiga_entries")
        .select(`
          id, fy, entry_type, status, paid_by, reference_no, submitted_at,
          families (
            payer_mobile, payer_email,
            family_members ( full_name, amount, is_primary_payer )
          )
        `)
        .eq("sabha_id", userProfile?.sabhaId)
        .eq("fy", entryFY)
        .eq("entry_type", formData?.entryType)
        .gte("submitted_at", fourteenDaysAgo.toISOString())
        .order("submitted_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const matchingEntries = [];

      for (const entry of (data || [])) {
        const entryTotal =
          entry?.families?.family_members?.reduce((sum, m) => sum + Number(m?.amount || 0), 0) || 0;

        // 1) Same reference number (for non-cash modes)
        if (
          formData?.referenceNo?.trim() &&
          formData?.paidBy !== 'Cash' &&
          entry?.reference_no?.trim() &&
          entry?.reference_no === formData?.referenceNo &&
          ['Cheque', 'NEFT/RTGS/IMPS', 'UPI']?.includes(formData?.paidBy)
        ) {
          matchingEntries.push({
            // Shape this similar to your UI expectation
            entryId: entry?.id,
            submittedDate: entry?.submitted_at,
            status: entry?.status,
            referenceNo: entry?.reference_no,
            members: [
              {
                name: entry?.families?.family_members?.find(m => m?.is_primary_payer)?.full_name || 'Unknown',
                amount: entryTotal
              }
            ],
            matchReason: 'Same reference number'
          });
          continue;
        }

        // 2) Same mobile + amount within 14 days
        if (
          formData?.payerMobile?.trim() &&
          entry?.families?.payer_mobile === formData?.payerMobile &&
          Math.abs(entryTotal - totalAmount) < 0.01
        ) {
          matchingEntries.push({
            entryId: entry?.id,
            submittedDate: entry?.submitted_at,
            status: entry?.status,
            referenceNo: entry?.reference_no,
            members: [
              {
                name: entry?.families?.family_members?.find(m => m?.is_primary_payer)?.full_name || 'Unknown',
                amount: entryTotal
              }
            ],
            matchReason: 'Same mobile number and amount within 14 days'
          });
          continue;
        }

        // 3) Same email + amount within 14 days
        if (
          formData?.payerEmail?.trim() &&
          entry?.families?.payer_email === formData?.payerEmail &&
          Math.abs(entryTotal - totalAmount) < 0.01
        ) {
          matchingEntries.push({
            entryId: entry?.id,
            submittedDate: entry?.submitted_at,
            status: entry?.status,
            referenceNo: entry?.reference_no,
            members: [
              {
                name: entry?.families?.family_members?.find(m => m?.is_primary_payer)?.full_name || 'Unknown',
                amount: entryTotal
              }
            ],
            matchReason: 'Same email and amount within 14 days'
          });
          continue;
        }
      }

      // Remove duplicate warnings by entryId
      const uniqueMatches = Array.from(
        new Map(matchingEntries.map(item => [item.entryId, item])).values()
      );

      setDuplicateWarnings(uniqueMatches);
      setShowDuplicateWarning(uniqueMatches.length > 0);
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      // Non-blocking; no toast needed, but you can keep this if you want:
      // toast.error("Duplicate check failed (non-blocking).");
    }
  };

  // Payment modes
  const paymentModes = [
    { value: 'Cash', label: 'Cash' },
    { value: 'Cheque', label: 'Cheque' },
    { value: 'NEFT/RTGS/IMPS', label: 'NEFT/RTGS/IMPS' },
    { value: 'UPI', label: 'UPI' }
  ];

  const genderOptions = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' },
    { value: 'Other', label: 'Other' }
  ];

  const gotraOptions = [
    { value: 'Koundinya', label: 'Koundinya' },
    { value: 'Bharadwaja', label: 'Bharadwaja' },
    { value: 'Vatsa', label: 'Vatsa' },
    { value: 'Kaushika', label: 'Kaushika' },
    { value: 'Atri', label: 'Atri' },
    { value: 'Kamshya', label: 'Kamshya' }
  ];

  const yesNoOptions = [
    { value: 'Yes', label: 'Yes' },
    { value: 'No', label: 'No' }
  ];

  const entryTypeOptions = [
    { value: 'Vantiga', label: 'Vantiga' },
    { value: 'Math Maryada', label: 'Math Maryada' }
  ];

  const AGE_PATTERN = /^\d+$/;
  const AGE_INPUT_PATTERN = /^\d*$/;
  const AMOUNT_PATTERN = /^\d*\.?\d{0,2}$/;

  const validateTopLevelField = (name, value, nextFormData = formData) => {
    const normalizedValue = typeof value === 'string' ? value.trim() : value;

    if (name === 'entryType' && !normalizedValue) {
      return 'Entry type is required';
    }

    if (name === 'sabha') {
      if (!normalizedValue) return 'Sabha is required';
      if (!userProfile?.sabhaId) return 'Sabha is not mapped to your user. Please contact admin.';
    }

    if (name === 'address' && !normalizedValue) {
      return 'Address is required';
    }

    if (name === 'payerMobile') {
      if (!normalizedValue) return 'Mobile number is required';
      if (!/^\d{10}$/.test(normalizedValue)) return 'Mobile number must be exactly 10 digits';
    }

    if (name === 'payerEmail') {
      if (!normalizedValue) return 'Email is required';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedValue)) return 'Invalid email format';
    }

    if (name === 'referenceNo' && nextFormData?.paidBy !== 'Cash' && !normalizedValue) {
      return 'Reference number is required for non-cash payments';
    }

    if (name === 'entryFY' && !value) {
      return 'Entry FY is required';
    }

    return '';
  };

  const validateMemberField = (member, index, field) => {
    const rawValue = member?.[field];
    const normalizedValue = typeof rawValue === 'string' ? rawValue.trim() : rawValue;

    if (field === 'firstName' && !normalizedValue) {
      return 'First name is required';
    }

    if (field === 'lastName' && !normalizedValue) {
      return 'Last name is required';
    }

    if (field === 'age') {
      if (!normalizedValue) return 'Age is required';
      if (!AGE_PATTERN.test(normalizedValue)) return 'Age must contain digits only';
      const parsedAge = Number.parseInt(normalizedValue, 10);
      if (!Number.isInteger(parsedAge) || parsedAge < 18) {
        return 'Age must be 18 or above';
      }
    }

    if (field === 'gotra' && !isMathMaryada && !normalizedValue) {
      return 'Gotra is required';
    }

    if (field === 'amount') {
      if (!normalizedValue) return 'Valid amount is required';
      if (!AMOUNT_PATTERN.test(normalizedValue)) return 'Enter a valid amount';
      const parsedAmount = Number.parseFloat(normalizedValue);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return 'Valid amount is required';
      }
    }

    return '';
  };

  const handleInputChange = (e) => {
    const { name, value } = e?.target;
    const nextFormData = { ...formData, [name]: value };

    setFormData(nextFormData);
    setTouchedFields((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => ({ ...prev, [name]: validateTopLevelField(name, value, nextFormData) }));
  };

  const handleSelectChange = (name, value) => {
    if (name === 'entryType') {
      const nextFormData = {
        ...formData,
        entryType: value,
        ...(value === 'Math Maryada'
          ? {
              optShowAmountInDirectory: 'No',
              optShowMobileInDirectory: 'No',
              optShowEmailInDirectory: 'No'
            }
          : {})
      };

      setFormData(nextFormData);
      setTouchedFields((prev) => ({ ...prev, entryType: true }));
      setErrors((prev) => {
        const nextErrors = {
          ...prev,
          entryType: validateTopLevelField('entryType', value, nextFormData)
        };
        if (value === 'Math Maryada') {
          Object.keys(nextErrors)
            .filter((key) => key.includes('_gotra'))
            .forEach((key) => delete nextErrors[key]);
        }
        return nextErrors;
      });

      if (value === 'Math Maryada') {
        setTouchedFields((prev) => {
          const nextTouched = { ...prev };
          Object.keys(nextTouched)
            .filter((key) => key.includes('_gotra'))
            .forEach((key) => delete nextTouched[key]);
          return nextTouched;
        });
        setMembers((prev) => {
          const primaryMember = prev?.[0] || {};
          return [{
            id: 1,
            firstName: primaryMember?.firstName || '',
            lastName: primaryMember?.lastName || '',
            age: primaryMember?.age || '',
            gender: primaryMember?.gender || 'Male',
            gotra: '',
            amount: primaryMember?.amount || '',
            relationship: 'Member'
          }];
        });
      }
      return;
    }

    const nextFormData = { ...formData, [name]: value };
    setFormData(nextFormData);
    setTouchedFields((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => {
      const nextErrors = {
        ...prev,
        [name]: validateTopLevelField(name, value, nextFormData)
      };
      if (name === 'paidBy') {
        nextErrors.referenceNo = validateTopLevelField('referenceNo', nextFormData?.referenceNo, nextFormData);
      }
      return nextErrors;
    });
  };

  const handleEntryFYChange = (value) => {
    setEntryFY(value);
    setTouchedFields((prev) => ({ ...prev, entryFY: true }));
    setErrors((prev) => ({ ...prev, entryFY: validateTopLevelField('entryFY', value) }));
  };

  // Member change + gotra auto-copy from member 1
  const handleMemberChange = (index, field, value) => {
    if (field === 'age' && !AGE_INPUT_PATTERN.test(value)) {
      return;
    }
    if (field === 'amount' && !AMOUNT_PATTERN.test(value)) {
      const errorKey = `member_${index}_${field}`;
      setTouchedFields((prev) => ({ ...prev, [errorKey]: true }));
      setErrors((prev) => ({
        ...prev,
        [errorKey]: 'Only numbers and one decimal point (up to 2 decimals) are allowed'
      }));
      return;
    }

    const updatedMembers = [...members];
    updatedMembers[index] = { ...updatedMembers?.[index], [field]: value };

    if (index === 0 && field === 'gotra' && value) {
      updatedMembers?.forEach((member, idx) => {
        if (idx > 0) {
          updatedMembers[idx] = { ...updatedMembers?.[idx], gotra: value };
        }
      });
    }

    setMembers(updatedMembers);
    const errorKey = `member_${index}_${field}`;
    setTouchedFields((prev) => ({ ...prev, [errorKey]: true }));
    setErrors((prev) => ({ ...prev, [errorKey]: validateMemberField(updatedMembers?.[index], index, field) }));
  };

  const addMember = () => {
    if (isMathMaryada) return;
    const additionalMembersCount = Math.max(members?.length - 1, 0);
    if (additionalMembersCount >= MAX_ADDITIONAL_MEMBERS) {
      return;
    }
    const member1Gotra = members?.[0]?.gotra || '';
    const newMember = {
      id: members?.length + 1,
      firstName: '',
      lastName: '',
      age: '',
      gender: 'Male',
      gotra: member1Gotra,
      amount: '',
      relationship: 'Family Member'
    };
    setMembers([...members, newMember]);
  };

  const removeMember = (index) => {
    if (index === 0) {
      toast?.error('Cannot remove primary payer (Member 1)');
      return;
    }
    const updatedMembers = members?.filter((_, i) => i !== index);
    setMembers(updatedMembers);
    setErrors((prev) => Object.fromEntries(
      Object.entries(prev).filter(([key]) => !key.startsWith('member_'))
    ));
    setTouchedFields((prev) => Object.fromEntries(
      Object.entries(prev).filter(([key]) => !key.startsWith('member_'))
    ));
  };

  const calculateTotalAmount = () => {
    return members?.reduce((sum, member) => sum + (parseFloat(member?.amount) || 0), 0);
  };

  const validateForm = () => {
    const newErrors = {};
    const requiredTopFields = ['entryType', 'sabha', 'address', 'payerMobile', 'payerEmail', 'entryFY'];

    requiredTopFields.forEach((fieldName) => {
      const value = fieldName === 'entryFY' ? entryFY : formData?.[fieldName];
      const fieldError = validateTopLevelField(fieldName, value, formData);
      if (fieldError) {
        newErrors[fieldName] = fieldError;
      }
    });

    if (formData?.paidBy !== 'Cash') {
      const refError = validateTopLevelField('referenceNo', formData?.referenceNo, formData);
      if (refError) {
        newErrors.referenceNo = refError;
      }
    }

    members?.forEach((member, index) => {
      ['firstName', 'lastName', 'age', 'amount'].forEach((field) => {
        const fieldError = validateMemberField(member, index, field);
        if (fieldError) {
          newErrors[`member_${index}_${field}`] = fieldError;
        }
      });

      if (!isMathMaryada) {
        const gotraError = validateMemberField(member, index, 'gotra');
        if (gotraError) {
          newErrors[`member_${index}_gotra`] = gotraError;
        }
      }
    });

    setErrors(newErrors);
    setTouchedFields((prev) => {
      const nextTouched = {
        ...prev,
        entryType: true,
        sabha: true,
        address: true,
        payerMobile: true,
        payerEmail: true,
        entryFY: true
      };
      if (formData?.paidBy !== 'Cash') {
        nextTouched.referenceNo = true;
      }
      members?.forEach((member, index) => {
        nextTouched[`member_${index}_firstName`] = true;
        nextTouched[`member_${index}_lastName`] = true;
        nextTouched[`member_${index}_age`] = true;
        nextTouched[`member_${index}_amount`] = true;
        if (!isMathMaryada) {
          nextTouched[`member_${index}_gotra`] = true;
        }
      });
      return nextTouched;
    });

    return Object.keys(newErrors)?.length === 0;
  };

  // -----------------------
  // SUBMIT: Insert into Supabase (families -> family_members -> vantiga_entries)
  // We use a transaction-like approach:
  // 1) Insert family row
  // 2) Insert members rows referencing family.id
  // 3) Insert entry referencing family.id + sabha_id
  //
  // NOTE: If step 2/3 fails after step 1 succeeded, you will have partial data.
  // Best practice: do this in a Postgres RPC function (server-side transaction).
  // For MVP, this is acceptable; later we’ll convert to RPC.
  // -----------------------
  const handleSubmit = async (e) => {
    e?.preventDefault();

    if (!validateForm()) {
      toast?.error('Please fix all errors before submitting');
      return;
    }

    setIsSubmitting(true);

    try {
      // 0) Ensure we have a logged-in session (optional but helpful)
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        toast.error("Your session expired. Please log in again.");
        navigate('/login', { replace: true });
        return;
      }

      // 1) Insert FAMILY
      // Map your UI fields -> DB column names
      const familyInsert = {
        sabha_id: userProfile?.sabhaId,
        address_multiline: formData?.address,
        payer_mobile: formData?.payerMobile,
        payer_email: formData?.payerEmail,
        opt_show_amount_in_directory: !isMathMaryada && formData?.optShowAmountInDirectory === "Yes",
        opt_show_mobile_in_directory: !isMathMaryada && formData?.optShowMobileInDirectory === "Yes",
        opt_show_email_in_directory: !isMathMaryada && formData?.optShowEmailInDirectory === "Yes",
      };

      const { data: familyRow, error: familyErr } = await supabase
        .from("families")
        .insert(familyInsert)
        .select("id")
        .single();

      if (familyErr) throw familyErr;

      const familyId = familyRow?.id;

      // 2) Insert FAMILY MEMBERS
      const membersToInsert = isMathMaryada ? members.slice(0, 1) : members;

      const membersInsert = membersToInsert.map((m, idx) => ({
        family_id: familyId,
        full_name: `${m?.firstName} ${m?.lastName}`.trim(),
        age: parseInt(m?.age, 10),
        gender: m?.gender,
        gotra: isMathMaryada ? null : (m?.gotra || null),
        amount: Number(m?.amount),
        is_primary_payer: idx === 0, // Member 1 is primary payer
      }));

      const { error: membersErr } = await supabase
        .from("family_members")
        .insert(membersInsert);

      if (membersErr) throw membersErr;

      // 3) Insert VANTIGA ENTRY
      const receiptNoForEntry =
        formData?.paidBy === "Cash"
          ? await generateReceiptNumberForCashEntry(entryFY)
          : null;

      const entryInsert = {
        sabha_id: userProfile?.sabhaId,  // MUST be UUID
        family_id: familyId,             // UUID from families insert
        fy: entryFY,
        entry_type: formData?.entryType,
        status: "SUBMITTED",
        paid_by: formData?.paidBy,
        reference_no: formData?.paidBy === "Cash" ? null : (formData?.referenceNo || null),
        receipt_no: receiptNoForEntry,
        submitted_at: new Date().toISOString(),
        submitted_by: sessionData?.session?.user?.id,
        // Optional fields if exist:
        // paid_by_name: ???,
      };

      const { error: entryErr } = await supabase
        .from("vantiga_entries")
        .insert(entryInsert);

      if (entryErr) throw entryErr;

      toast?.success('Entry submitted successfully');

      setTimeout(() => {
        navigate('/sabha-dashboard', { state: { activeTab: 'entries' } });
      }, 1200);
    } catch (error) {
      console.error('Error submitting entry:', error);

      // Show Supabase error message if available
      const msg =
        error?.message ||
        error?.details ||
        'Failed to submit entry. Please try again.';

      toast?.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate('/sabha-dashboard');
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date?.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (userProfile?.role === 'treasurer') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Toaster position="top-right" />
        <div className="max-w-md w-full bg-card border border-border rounded-lg p-8 text-center shadow-lg">
          <div className="mb-6">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon name="ShieldAlert" size={32} className="text-destructive" />
            </div>
            <h2 className="text-2xl font-bold text-card-foreground mb-2">
              Access Denied
            </h2>
            <p className="text-muted-foreground">
              Only Pratinidhi users can create new entries. Please contact your administrator if you need access.
            </p>
          </div>
          <Button
            variant="default"
            onClick={() => navigate('/sabha-dashboard')}
            iconName="ArrowLeft"
            iconPosition="left"
            className="w-full"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-right" />

      {/* Common Header */}
      <CommonHeader />

      {/* Page Header */}
      <div className="bg-card border-b border-border shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <button
              onClick={() => navigate('/sabha-dashboard')}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Icon name="ChevronLeft" size={16} />
              Sabha Dashboard
            </button>
          </div>
          <h2 className="text-3xl font-bold text-card-foreground">
            New Entry
          </h2>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-8">
          <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-card-foreground mb-4 flex items-center gap-2">
              <Icon name="Calendar" size={20} />
              Entry Financial Year
            </h2>
            <div className="max-w-sm">
              <Select
                label="Entry FY"
                value={entryFY}
                onChange={handleEntryFYChange}
                options={fyOptions}
                required
                error={touchedFields?.entryFY ? errors?.entryFY : ''}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Entry FY determines where this submission is recorded.
            </p>
            <div className="mt-4 max-w-sm">
              <Select
                label="Entry Type"
                value={formData?.entryType}
                onChange={(value) => handleSelectChange('entryType', value)}
                options={entryTypeOptions}
                required
                error={touchedFields?.entryType ? errors?.entryType : ''}
              />
            </div>
          </div>

          {/* Duplicate Warning Panel */}
          {showDuplicateWarning && duplicateWarnings?.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                    <Icon name="AlertTriangle" size={20} className="text-amber-600" />
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-amber-900 mb-2 flex items-center gap-2">
                    Similar Entries Found
                  </h3>
                  <p className="text-sm text-amber-800 mb-4">
                    We found {duplicateWarnings?.length} similar {duplicateWarnings?.length === 1 ? 'entry' : 'entries'} in this Sabha for Entry FY {entryFY}.
                    Please confirm this is not a resubmission before proceeding.
                  </p>

                  <div className="space-y-3">
                    {duplicateWarnings?.map((entry, index) => {
                      const payerName = entry?.members?.[0]?.name || 'Unknown';
                      const totalAmount = entry?.members?.reduce((sum, m) => sum + (m?.amount || 0), 0);

                      return (
                        <div
                          key={entry?.entryId || index}
                          className="bg-white border border-amber-200 rounded-lg p-4"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                            <div>
                              <p className="text-amber-600 font-medium mb-1">Date</p>
                              <p className="text-gray-900">{formatDate(entry?.submittedDate)}</p>
                            </div>
                            <div>
                              <p className="text-amber-600 font-medium mb-1">Payer Name</p>
                              <p className="text-gray-900">{payerName}</p>
                            </div>
                            <div>
                              <p className="text-amber-600 font-medium mb-1">Amount</p>
                              <p className="text-gray-900 font-semibold">₹{Number(totalAmount || 0)?.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-amber-600 font-medium mb-1">Status</p>
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                entry?.status === 'ACKNOWLEDGED'
                                  ? 'bg-green-100 text-green-800'
                                  : entry?.status === 'REJECTED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}>
                                {entry?.status}
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t border-amber-200">
                            <p className="text-xs text-amber-700 italic">
                              Match reason: {entry?.matchReason}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-sm text-amber-800">
                    <Icon name="Info" size={16} />
                    <p>This is a warning only. You can still proceed with submission if this is a new entry.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Members Section */}
          <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold text-card-foreground flex items-center gap-2">
                <Icon name="UserPlus" size={20} />
                {isMathMaryada ? 'Primary Payer Details' : 'Family Members'}
              </h2>
              {!isMathMaryada && (
                <div className="flex flex-col items-end gap-2 text-right">
                  <span className="text-xs text-muted-foreground">
                    Members: {members?.length || 1} / {MAX_ADDITIONAL_MEMBERS + 1} maximum
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addMember}
                    iconName="Plus"
                    iconPosition="left"
                    disabled={Math.max(members?.length - 1, 0) >= MAX_ADDITIONAL_MEMBERS}
                  >
                    Add Member
                  </Button>
                </div>
              )}
            </div>
            {!isMathMaryada && Math.max(members?.length - 1, 0) >= MAX_ADDITIONAL_MEMBERS && (
              <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                You’ve reached the maximum limit of 3 members (Self + 2).
              </div>
            )}

            <div className="space-y-6">
              {members?.map((member, index) => (
                <div key={member?.id} className="bg-muted/50 border border-border rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-card-foreground">
                      {isMathMaryada
                        ? 'Primary Payer'
                        : (index === 0 ? 'Member 1 (Primary Payer)' : `Member ${index + 1}`)}
                    </h3>
                    {!isMathMaryada && index > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMember(index)}
                        iconName="Trash2"
                        className="text-destructive hover:text-destructive"
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Input
                      label="First Name"
                      value={member?.firstName}
                      onChange={(e) => handleMemberChange(index, 'firstName', e?.target?.value)}
                      placeholder="First name"
                      required
                      error={touchedFields?.[`member_${index}_firstName`] ? errors?.[`member_${index}_firstName`] : ''}
                    />
                    <Input
                      label="Last Name"
                      value={member?.lastName}
                      onChange={(e) => handleMemberChange(index, 'lastName', e?.target?.value)}
                      placeholder="Last name"
                      required
                      error={touchedFields?.[`member_${index}_lastName`] ? errors?.[`member_${index}_lastName`] : ''}
                    />
                    <Input
                      label="Age"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min="18"
                      value={member?.age}
                      onChange={(e) => handleMemberChange(index, 'age', e?.target?.value)}
                      placeholder="Age"
                      required
                      error={touchedFields?.[`member_${index}_age`] ? errors?.[`member_${index}_age`] : ''}
                    />
                    <Select
                      label="Gender"
                      value={member?.gender}
                      onChange={(value) => handleMemberChange(index, 'gender', value)}
                      options={genderOptions}
                      required
                    />
                    {!isMathMaryada && (
                      <Select
                        label="Gotra"
                        value={member?.gotra}
                        onChange={(value) => handleMemberChange(index, 'gotra', value)}
                        options={gotraOptions}
                        placeholder="Select Gotra"
                        required
                        error={touchedFields?.[`member_${index}_gotra`] ? errors?.[`member_${index}_gotra`] : ''}
                        disabled={index > 0}
                        title={index > 0 ? 'Gotra is auto-populated from Member 1' : ''}
                      />
                    )}
                    <Input
                      label="Contribution Amount (₹)"
                      type="text"
                      inputMode="decimal"
                      value={member?.amount}
                      onChange={(e) => handleMemberChange(index, 'amount', e?.target?.value)}
                      placeholder="Amount"
                      required
                      error={touchedFields?.[`member_${index}_amount`] ? errors?.[`member_${index}_amount`] : ''}
                    />
                  </div>
                  {!isMathMaryada && index > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground italic flex items-center gap-1">
                        <Icon name="Info" size={14} />
                        Gotra is automatically populated from Member 1
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Total Amount Display */}
            <div className="mt-6 pt-6 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-card-foreground">
                  Total Amount:
                </span>
                <span className="text-2xl font-bold">
                  ₹{calculateTotalAmount()?.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Family Information Section */}
          <div className="bg-card border border-border rounded-lg p-6 shadow-sm ">
            <h2 className="text-xl font-semibold text-card-foreground mb-6 flex items-center gap-2">
              <Icon name="Users" size={20} />
              {isMathMaryada ? 'Payer Contact Details' : 'Family Information'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Sabha"
                name="sabha"
                value={formData?.sabha}
                readOnly
                placeholder="e.g., Bangalore"
                required
                error={touchedFields?.sabha ? errors?.sabha : ''}
                title="Sabha is auto-mapped from your profile"
              />
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Address <span className="text-destructive">*</span>
                </label>
                <textarea
                  name="address"
                  value={formData?.address}
                  onChange={handleInputChange}
                  placeholder="Enter complete address with multiple lines"
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                />
                {touchedFields?.address && errors?.address && (
                  <p className="text-sm text-destructive mt-2">{errors?.address}</p>
                )}
              </div>
              <Input
                label="Mobile Number"
                name="payerMobile"
                type="tel"
                value={formData?.payerMobile}
                onChange={handleInputChange}
                placeholder="10-digit mobile number"
                required
                error={touchedFields?.payerMobile ? errors?.payerMobile : ''}
              />
              <Input
                label="Email ID"
                name="payerEmail"
                type="email"
                value={formData?.payerEmail}
                onChange={handleInputChange}
                placeholder="email@example.com"
                required
                error={touchedFields?.payerEmail ? errors?.payerEmail : ''}
              />
            </div>
          </div>

          {/* Payment Details Section */}
          <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-card-foreground mb-6 flex items-center gap-2">
              <Icon name="CreditCard" size={20} />
              Payment Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Select
                label="Payment Mode"
                value={formData?.paidBy}
                onChange={(value) => handleSelectChange('paidBy', value)}
                options={paymentModes}
                required
              />
              {formData?.paidBy !== 'Cash' && (
                <Input
                  label="Reference Number"
                  name="referenceNo"
                  value={formData?.referenceNo}
                  onChange={handleInputChange}
                  placeholder="Enter cheque/transaction reference"
                  required
                  error={touchedFields?.referenceNo ? errors?.referenceNo : ''}
                />
              )}
            </div>
          </div>

          {!isMathMaryada && (
            <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-card-foreground mb-6 flex items-center gap-2">
                <Icon name="Eye" size={20} />
                Vantiga Directory Opt-in Options
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Select
                  label="Show Amount in Directory"
                  value={formData?.optShowAmountInDirectory}
                  onChange={(value) => handleSelectChange('optShowAmountInDirectory', value)}
                  options={yesNoOptions}
                />
                <Select
                  label="Show Mobile in Directory"
                  value={formData?.optShowMobileInDirectory}
                  onChange={(value) => handleSelectChange('optShowMobileInDirectory', value)}
                  options={yesNoOptions}
                />
                <Select
                  label="Show Email in Directory"
                  value={formData?.optShowEmailInDirectory}
                  onChange={(value) => handleSelectChange('optShowEmailInDirectory', value)}
                  options={yesNoOptions}
                />
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="outline"
              disabled={isSubmitting}
              iconName={isSubmitting ? undefined : 'Check'}
              iconPosition="left"
              className="bg-[#F97316] text-white"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin " />
                  Submitting...
                </div>
              ) : (
                'Submit Entry'
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default NewEntryForm;
