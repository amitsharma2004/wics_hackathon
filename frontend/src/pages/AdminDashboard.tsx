import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ToastContainer } from '../components';
import { useToast } from '../hooks/useToast';

interface Driver {
  _id: string;
  user: {
    name: string;
    email: string;
    phoneNumber?: string;
  };
  licenseNumber: string;
  vehicle: {
    model: string;
    color: string;
    licensePlate: string;
    type: string;
  };
  isVerified: boolean;
  isBlocked: boolean;
  isOnline: boolean;
  totalRides: number;
  averageRating: number;
  createdAt: string;
}

export default function AdminDashboard() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [actionType, setActionType] = useState<'verify' | 'reject' | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();

  useEffect(() => {
    if (!authLoading) {
      if (!user || user.role !== 'admin') {
        toast.error('Access denied. Admin only.');
        navigate('/dashboard');
        return;
      }
      fetchPendingDrivers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, navigate]);

  const fetchPendingDrivers = async () => {
    try {
      console.log('Fetching pending drivers from: http://localhost:3000/api/admin/drivers/pending');
      const response = await fetch('http://localhost:3000/api/admin/drivers/pending', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Received pending drivers:', data.length);
        setDrivers(data);
      } else {
        const errorText = await response.text();
        console.error('Failed to fetch pending drivers:', response.status, errorText);
        toast.error('Failed to fetch pending drivers');
      }
    } catch (error) {
      console.error('Error fetching drivers:', error);
      toast.error('Failed to fetch pending drivers');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyDriver = async (driverId: string, isVerified: boolean) => {
    try {
      const response = await fetch(`http://localhost:3000/api/admin/drivers/${driverId}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ isVerified })
      });

      if (response.ok) {
        toast.success(isVerified ? 'Driver verified successfully' : 'Driver rejected');
        fetchPendingDrivers();
        setShowModal(false);
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to update driver');
      }
    } catch (error) {
      console.error('Error verifying driver:', error);
      toast.error('Failed to verify driver');
    }
  };

  const handleRejectDriver = async (driverId: string) => {
    try {
      const response = await fetch(`http://localhost:3000/api/admin/drivers/${driverId}/block`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ 
          isBlocked: true,
          reason: blockReason || 'Application rejected'
        })
      });

      if (response.ok) {
        toast.success('Driver application rejected');
        fetchPendingDrivers();
        setShowModal(false);
        setBlockReason('');
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to reject driver');
      }
    } catch (error) {
      console.error('Error rejecting driver:', error);
      toast.error('Failed to reject driver');
    }
  };

  const openModal = (driver: Driver, action: 'verify' | 'reject') => {
    setSelectedDriver(driver);
    setActionType(action);
    setShowModal(true);
  };

  const handleConfirmAction = () => {
    if (!selectedDriver) return;

    if (actionType === 'verify') {
      handleVerifyDriver(selectedDriver._id, true);
    } else if (actionType === 'reject') {
      handleRejectDriver(selectedDriver._id);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />

      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/me')}
                className="p-2 hover:bg-gray-100 rounded-full transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Driver Verification</h1>
            </div>
            <button
              onClick={() => fetchPendingDrivers()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Pending Verification</p>
            <p className="text-3xl font-bold text-yellow-600">{drivers.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Awaiting Review</p>
            <p className="text-3xl font-bold text-indigo-600">
              {drivers.filter(d => new Date(d.createdAt).getTime() > Date.now() - 24 * 60 * 60 * 1000).length}
            </p>
            <p className="text-xs text-gray-500 mt-1">Last 24 hours</p>
          </div>
        </div>

        {/* Pending Drivers Table */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">Pending Driver Applications</h2>
            <p className="text-sm text-gray-600">Review and approve new driver registrations</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">License</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Applied</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {drivers.map((driver) => (
                  <tr key={driver._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{driver.user.name}</p>
                        <p className="text-sm text-gray-500">{driver.user.email}</p>
                        {driver.user.phoneNumber && (
                          <p className="text-sm text-gray-500">{driver.user.phoneNumber}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{driver.vehicle.model}</p>
                        <p className="text-sm text-gray-500">{driver.vehicle.color} • {driver.vehicle.type}</p>
                        <p className="text-sm font-mono text-gray-700">{driver.vehicle.licensePlate}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-mono text-gray-900">{driver.licenseNumber}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-900">
                        {new Date(driver.createdAt).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(driver.createdAt).toLocaleTimeString()}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openModal(driver, 'verify')}
                          className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition flex items-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Approve
                        </button>
                        <button
                          onClick={() => openModal(driver, 'reject')}
                          className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition flex items-center gap-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {drivers.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-gray-500 font-medium">No pending applications</p>
              <p className="text-sm text-gray-400 mt-1">All driver applications have been reviewed</p>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showModal && selectedDriver && (
        <div className="fixed inset-0 z-[2000] bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {actionType === 'verify' && 'Approve Driver Application'}
              {actionType === 'reject' && 'Reject Driver Application'}
            </h3>
            
            <div className="mb-4 bg-gray-50 rounded-lg p-4">
              <p className="text-gray-700 mb-2">
                <span className="font-medium">Driver:</span> {selectedDriver.user.name}
              </p>
              <p className="text-gray-700 mb-2">
                <span className="font-medium">Email:</span> {selectedDriver.user.email}
              </p>
              <p className="text-gray-700 mb-2">
                <span className="font-medium">Vehicle:</span> {selectedDriver.vehicle.model} ({selectedDriver.vehicle.type})
              </p>
              <p className="text-gray-700">
                <span className="font-medium">License Plate:</span> {selectedDriver.vehicle.licensePlate}
              </p>
            </div>

            {actionType === 'reject' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for rejection (optional)
                </label>
                <textarea
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  rows={3}
                  placeholder="Enter reason..."
                />
              </div>
            )}

            {actionType === 'verify' && (
              <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-800">
                  This driver will be verified and can start accepting rides.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  setBlockReason('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                className={`flex-1 px-4 py-2 text-white rounded-lg transition ${
                  actionType === 'verify' 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {actionType === 'verify' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
