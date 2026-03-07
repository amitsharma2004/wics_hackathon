import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function OAuthCallback() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  useEffect(() => {
    const handleOAuthCallback = async () => {
      try {
        // Get tokens from URL params
        const params = new URLSearchParams(window.location.search);
        const accessToken = params.get('accessToken');
        const refreshToken = params.get('refreshToken');
        const error = params.get('error');

        if (error) {
          navigate('/login?error=oauth_failed');
          return;
        }

        if (!accessToken || !refreshToken) {
          navigate('/login?error=missing_tokens');
          return;
        }

        // Store tokens in localStorage
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);

        // Fetch user profile with the new tokens before navigating
        await refreshUser();

        // Now navigate to dashboard
        navigate('/dashboard');
      } catch (error) {
        navigate('/login?error=callback_failed');
      }
    };

    handleOAuthCallback();
  }, [navigate, refreshUser]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Completing sign in...</p>
      </div>
    </div>
  );
}
