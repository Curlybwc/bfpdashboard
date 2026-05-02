import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { HardHat, Mail } from 'lucide-react';

const Login = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const inviteEmailParam = searchParams.get('email');
  const [isSignUp, setIsSignUp] = useState(!!inviteToken);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState(inviteEmailParam ?? '');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/today', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Check your email', description: 'We sent you a password reset link.' });
      setIsForgotPassword(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            ...(inviteToken ? { invite_token: inviteToken } : {}),
          },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        toast({ title: 'Sign up failed', description: error.message, variant: 'destructive' });
      } else {
        toast({
          title: 'Check your email',
          description: inviteToken
            ? "We sent you a confirmation link. After confirming, you'll join the organization that invited you."
            : 'We sent you a confirmation link.',
        });
      }
    } else {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({ title: 'Login failed', description: error.message, variant: 'destructive' });
      } else {
        // Check if user is deactivated
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_active')
          .eq('id', signInData.user.id)
          .single();
        if (profile && profile.is_active === false) {
          await supabase.auth.signOut();
          toast({ title: 'Account deactivated', description: 'Your account has been deactivated. Contact an administrator.', variant: 'destructive' });
        } else {
          navigate('/today', { replace: true });
        }
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm animate-slide-up">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <HardHat className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl">{isForgotPassword ? 'Reset Password' : isSignUp ? 'Create Account' : 'Welcome Back'}</CardTitle>
          <p className="text-sm text-muted-foreground">Contractor Task & Scope Manager</p>
        </CardHeader>
        <CardContent>
          {inviteToken && isSignUp && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
              <Mail className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">You've been invited to join an organization.</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Sign up with the invited email to accept. The invite is valid for 14 days.
                </p>
              </div>
            </div>
          )}
          {isForgotPassword ? (
            <>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>
              </form>
              <button
                onClick={() => setIsForgotPassword(false)}
                className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                {isSignUp && (
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                </div>
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(true)}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
                </Button>
              </form>
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
