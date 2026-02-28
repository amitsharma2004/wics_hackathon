import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ToastContainer } from '../components';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';

export default function BecomeDriver() {
  const [formData, setFormData] = useState({
    licenseNumber: '',
    vehicleModel: '',
    vehicleColor: '',
    licensePlate: '',
    vehicleType: 'Mini' as 'Mini' | 'Sedan' | 'SUV'
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const { user, loading: authLoading, isAuthenticated } = useAuth();

  // Check authentication and redirect if needed
  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        toast.error('Please login first');
        navigate('/login');
        return;
      }

      // Check if user is already a driver
      if (user?.role === 'driver' || user?.role === 'both') {
        toast.info('You already have a driver profile');
        navigate('/driver');
      }
    }
  }, [authLoading, isAuthenticated, user, navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('http://localhost:3000/api/drivers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          licenseNumber: formData.licenseNumber.toUpperCase(),
          vehicle: {
            model: formData.vehicleModel,
            color: formData.vehicleColor,
            licensePlate: formData.licensePlate.toUpperCase(),
            type: formData.vehicleType
          }
        })
      });

      if (response.ok) {
        toast.success('Driver profile created successfully!');
        setTimeout(() => {
          navigate('/driver');
        }, 1500);
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to create driver profile');
      }
    } catch (error) {
      console.error('Error creating driver profile:', error);
      toast.error('Failed to create driver profile');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />

      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/me')}
              className="p-2 hover:bg-gray-100 rounded-full transition"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Become a Driver</h1>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Info Card */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Start Earning Today!</h2>
              <p className="text-sm text-gray-700">
                Join our platform and start earning by providing rides. Flexible hours, competitive earnings, and be your own boss!
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* License Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Driving License Number
              </label>
              <input
                type="text"
                name="licenseNumber"
                value={formData.licenseNumber}
                onChange={handleChange}
                placeholder="e.g., DL1234567890"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Enter your valid driving license number</p>
            </div>

            {/* Vehicle Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Vehicle Type
              </label>
              <select
                name="vehicleType"
                value={formData.vehicleType}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                required
              >
                <option value="Mini">Mini - Compact cars (₹10/km)</option>
                <option value="Sedan">Sedan - Comfortable sedans (₹12/km)</option>
                <option value="SUV">SUV - Spacious SUVs (₹15/km)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">Different vehicle types have different pricing</p>
            </div>

            {/* Vehicle Model */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Vehicle Model
              </label>
              <input
                type="text"
                name="vehicleModel"
                value={formData.vehicleModel}
                onChange={handleChange}
                placeholder="e.g., Honda City, Maruti Swift"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                required
              />
            </div>

            {/* Vehicle Color */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Vehicle Color
              </label>
              <input
                type="text"
                name="vehicleColor"
                value={formData.vehicleColor}
                onChange={handleChange}
                placeholder="e.g., White, Black, Silver"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                required
              />
            </div>

            {/* License Plate */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                License Plate Number
              </label>
              <input
                type="text"
                name="licensePlate"
                value={formData.licensePlate}
                onChange={handleChange}
                placeholder="e.g., DL01AB1234"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition uppercase"
                required
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-4 rounded-xl font-semibold hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating Profile...' : 'Create Driver Profile'}
            </button>
          </form>
        </div>

        {/* Terms */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            By creating a driver profile, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
