import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Icon from '../../components/AppIcon';
import Checkbox from '../../components/ui/Checkbox';

// ✅ Supabase
import { supabase } from "../../supabaseClient";

const Login = () => {
  const logoUrl = new URL('../../../cropped-Math-Logo-Round.png', import.meta.url).href;
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  useEffect(() => {
    const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
    if (isAuthenticated) {
      const userProfile = JSON.parse(localStorage.getItem('userProfile') || '{}');
      const defaultRoute = getDefaultRouteForRole(userProfile?.role);
      navigate(defaultRoute, { replace: true });
    }

    const savedEmail = localStorage.getItem('rememberedEmail');
    const savedRememberMe = localStorage.getItem('rememberMe') === 'true';
    if (savedRememberMe && savedEmail) {
      setFormData(prev => ({ ...prev, email: savedEmail }));
      setRememberMe(true);
    }
  }, [navigate]);

  // KEEP: not used
  const mockUsers = [
    { email: "admin@scmoffice.org", password: "SCMAdmin@2025", role: "scm_office", sabha: null },
    { email: "pratinidhi@mumbai.sabha.org", password: "Mumbai@2025", role: "pratinidhi", sabha: "Mumbai Sabha" },
    { email: "treasurer@delhi.sabha.org", password: "Delhi@2025", role: "treasurer", sabha: "Delhi Sabha" },
    { email: "pratinidhi@bangalore.sabha.org", password: "Bangalore@2025", role: "pratinidhi", sabha: "Bangalore Sabha" },
    { email: "treasurer@chennai.sabha.org", password: "Chennai@2025", role: "treasurer", sabha: "Chennai Sabha" }
  ];

  const getDefaultRouteForRole = (role) => {
    const roleRoutes = {
      scm_office: '/scm-office-dashboard',
      pratinidhi: '/sabha-dashboard',
      treasurer: '/sabha-dashboard',
    };
    return roleRoutes?.[role] || '/login';
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData?.email?.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData?.email)) newErrors.email = 'Please enter a valid email address';

    if (!formData?.password?.trim()) newErrors.password = 'Password is required';
    else if (formData?.password?.length < 8) newErrors.password = 'Password must be at least 8 characters';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e?.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors?.[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  /**
   * ✅ IMPORTANT FIX
   * Your previous `fetchUserProfile` reads from `profiles` (role/sabha fields),
   * but your actual mapping is in `user_sabha_profile` (as you said).
   *
   * This function:
   * - fetches ALL rows for the user
   * - prefers ACTIVE scm_office row if present
   * - else prefers first ACTIVE row
   * - returns { role, sabha, sabhaId, fullName }
   */
  const fetchUserProfile = async (userId, fallbackEmail) => {
    const { data: rows, error } = await supabase
      .from("user_sabha_roles")
      .select("*")
      .eq("user_id", userId);

    if (error) throw error;

    if (!rows || rows.length === 0) {
      throw new Error("Your role/sabha is not mapped to your user. Please contact admin.");
    }

    const activeRows = rows.filter(r => (r.is_active ?? true));

    // Prefer scm_office if present
    const picked =
      activeRows.find(r => r.role === 'scm_office') ||
      activeRows[0] ||
      rows.find(r => r.role === 'scm_office') ||
      rows[0];

    // Try common column names safely (so it works even if your column names differ)
    const role = picked?.role || 'pratinidhi';

    const sabhaName =
      picked?.sabha_name ??
      picked?.sabha ??
      picked?.sabhas?.name ?? // if view returns nested (unlikely)
      null;

    const sabhaId =
      picked?.sabha_id ??
      picked?.sabhaId ??
      null;

    const fullName =
      picked?.full_name ??
      picked?.name ??
      picked?.display_name ??
      (fallbackEmail ? fallbackEmail.split('@')[0] : '—');

    return { role, sabha: sabhaName, sabhaId, fullName };
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const email = formData?.email?.trim();

      // ✅ Auth login
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: formData?.password,
      });

      if (error) {
        setErrors({ password: error.message || 'Invalid email or password. Please try again.' });
        return;
      }

      const user = data?.user;
      if (!user) {
        setErrors({ password: 'Invalid email or password. Please try again.' });
        return;
      }

      // ✅ Fetch role mapping from user_sabha_profile
      const profile = await fetchUserProfile(user.id, email);

      const userProfile = {
        user_id: user.id,
        email: user?.email,
        role: profile?.role,
        sabha: profile?.sabha,       // can be null for scm_office
        sabhaId: profile?.sabhaId,   // can be null for scm_office
        name: profile?.fullName
      };

      // ✅ Persist auth gate
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('userProfile', JSON.stringify(userProfile));

      // keep sabha_id for sabha-based pages (optional)
      if (profile?.sabhaId) localStorage.setItem("sabha_id", profile.sabhaId);
      else localStorage.removeItem("sabha_id");

      // Remember me
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
        localStorage.setItem('rememberMe', 'true');
      } else {
        localStorage.removeItem('rememberedEmail');
        localStorage.removeItem('rememberMe');
      }

      // ✅ Redirect: ALWAYS prefer role-based default (do NOT allow stale redirectPath to send scm_office to sabha-dashboard)
      const roleDefault = getDefaultRouteForRole(profile?.role);

      // only use redirectPath if it matches role (prevents scm_office going to sabha-dashboard)
      const redirectPath = localStorage.getItem('redirectPath');
      localStorage.removeItem('redirectPath');

      const safeRedirect =
        profile?.role === 'scm_office'
          ? '/scm-office-dashboard'
          : (redirectPath || roleDefault);

      navigate(safeRedirect, { replace: true });
    } catch (err) {
      console.error("Login error:", err);
      setErrors({ password: err?.message || 'Login failed. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => setShowForgotPassword(true);

  const handleForgotPasswordSubmit = async (e) => {
    e?.preventDefault();

    if (!formData?.email?.trim()) {
      setErrors({ email: 'Please enter your email address' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData?.email)) {
      setErrors({ email: 'Please enter a valid email address' });
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(formData.email.trim(), {
        redirectTo: window.location.origin + "/reset-password",
      });
      if (error) throw error;

      alert(`Password reset instructions have been sent to ${formData?.email}. Please check your inbox.`);
      setShowForgotPassword(false);
      setErrors({});
    } catch (err) {
      console.error("Forgot password error:", err);
      setErrors({ email: err?.message || 'Failed to send reset email. Please try again.' });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-lg shadow-lg elevation-lg p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-transperant rounded-full mb-4">
              <img src={logoUrl} alt="SCM Vantiga Portal" className="w-20 h-20" />
            </div>
            <h1 className="text-2xl font-semibold text-card-foreground mb-2">
              {showForgotPassword ? 'Reset Password' : 'Digital Vantiga Reciept System'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {showForgotPassword
                ? 'Enter your email to receive reset instructions'
                : 'Sign in to access your dashboard'}
            </p>
            {!showForgotPassword }
          </div>

          {!showForgotPassword ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <Input
                label="Email Address"
                type="email"
                name="email"
                placeholder="Enter your email"
                value={formData?.email}
                onChange={handleInputChange}
                error={errors?.email}
                required
                disabled={isLoading}
              />

              <Input
                label="Password"
                type="password"
                name="password"
                placeholder="Enter your password"
                value={formData?.password}
                onChange={handleInputChange}
                error={errors?.password}
                required
                disabled={isLoading}
                showPasswordToggle={true}
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember-me"
                    checked={rememberMe}
                    onCheckedChange={setRememberMe}
                    disabled={isLoading}
                  />
                  <label
                    htmlFor="remember-me"
                    className="text-sm font-medium text-foreground cursor-pointer select-none"
                  >
                    Remember me
                  </label>
                </div>


              </div>

              <Button
                type="submit"
                variant="outline"
                fullWidth
                loading={isLoading}
                disabled={isLoading}
                className="bg-[#F97316] text-white"
              >
                Sign In
              </Button>
            </form>
          ) : (
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-6">
              <Input
                label="Email Address"
                type="email"
                name="email"
                placeholder="Enter your email"
                value={formData?.email}
                onChange={handleInputChange}
                error={errors?.email}
                required
              />

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  fullWidth
                  onClick={() => {
                    setShowForgotPassword(false);
                    setErrors({});
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="default" fullWidth>
                  Send Reset Link
                </Button>
              </div>
            </form>
          )}


        </div>


      </div>
    </div>
  );
};

export default Login;
