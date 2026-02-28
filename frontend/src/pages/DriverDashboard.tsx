import { useState, useEffect } from 'react';
import { socketClient } from '../utils/socketClient';
import { ToastContainer } from '../components';
import { useToast } from '../hooks/useToast';

interface RideRequest {
  requestId: string;
  riderId: string;
  riderName: string;
  pickup: {
    address: string;
    coordinates: [number, number];
  };
  destination: {
    address: string;
    coordinates: [number, number];
  };
  fare: number;
  distance: number;
  expiresIn: number;
}

export default function DriverDashboard() {
  const [isOnline, setIsOnline] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [incomingRequest, setIncomingRequest] = useState<RideRequest | null>(null);
  const [requestTimer, setRequestTimer] = useState<number>(0);
  const [driverProfile, setDriverProfile] = useState<any>(null);
  
  // Initialize toast notifications
  const toast = useToast();

  // Initialize socket and fetch driver profile
  useEffect(() => {
    const initializeDriver = async () => {
      try {
        // Fetch driver profile
        const response = await fetch('http://localhost:3000/api/drivers/me', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          setDriverProfile(data);
          setIsOnline(data.isOnline);
          setIsAvailable(data.isAvailable);
        }

        // Initialize socket
        const token = document.cookie
          .split('; ')
          .find(row => row.startsWith('accessToken='))
          ?.split('=')[1];
        
        if (token) {
          socketClient.connect(token);
          setSocketConnected(true);
          
          // Setup socket listeners
          socketClient.onRideRequest((request: RideRequest) => {
            console.log('Incoming ride request:', request);
            setIncomingRequest(request);
            setRequestTimer(request.expiresIn);
            toast.info('New ride request received!');
          });
          
          socketClient.onRideAcceptSuccess((data) => {
            console.log('Ride accepted successfully:', data);
            setIncomingRequest(null);
            toast.success('Ride accepted successfully!');
          });
          
          socketClient.onRideAcceptFailed((data) => {
            console.log('Ride accept failed:', data);
            toast.error('Failed to accept ride: ' + data.message);
            setIncomingRequest(null);
          });
          
          socketClient.onRideRequestCancelled((data) => {
            console.log('Ride request cancelled:', data);
            toast.warning('Ride request was cancelled');
            setIncomingRequest(null);
          });
        }
      } catch (error) {
        console.error('Error initializing driver:', error);
      }
    };

    initializeDriver();

    return () => {
      socketClient.disconnect();
    };
  }, []);

  // Timer countdown for ride request
  useEffect(() => {
    if (incomingRequest && requestTimer > 0) {
      const interval = setInterval(() => {
        setRequestTimer(prev => {
          if (prev <= 1) {
            setIncomingRequest(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [incomingRequest, requestTimer]);

  // Get current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentLocation([latitude, longitude]);
        },
        (error) => {
          console.error('Error getting location:', error);
        }
      );
    }
  }, []);

  // Register with socket when going online
  useEffect(() => {
    if (socketConnected && isOnline && currentLocation) {
      socketClient.registerUser('driver', [currentLocation[1], currentLocation[0]]);
    }
  }, [socketConnected, isOnline, currentLocation]);

  // Update location periodically
  useEffect(() => {
    if (!isOnline || !currentLocation) return;

    const interval = setInterval(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            setCurrentLocation([latitude, longitude]);
            
            // Update location in backend
            await fetch('http://localhost:3000/api/drivers/location', {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json'
              },
              credentials: 'include',
              body: JSON.stringify({
                coordinates: [longitude, latitude],
                socketId: socketClient.getSocket()?.id
              })
            });

            // Update via socket
            socketClient.updateLocation([longitude, latitude]);
          },
          (error) => {
            console.error('Error updating location:', error);
          }
        );
      }
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [isOnline, currentLocation]);

  const toggleOnlineStatus = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/drivers/status', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          isOnline: !isOnline,
          isAvailable: !isOnline
        })
      });

      if (response.ok) {
        const data = await response.json();
        setIsOnline(data.isOnline);
        setIsAvailable(data.isAvailable);
        toast.success(data.isOnline ? 'You are now online' : 'You are now offline');
      } else {
        toast.error('Failed to update status');
      }
    } catch (error) {
      console.error('Error toggling status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleAcceptRide = () => {
    if (incomingRequest) {
      socketClient.acceptRide(incomingRequest.requestId);
    }
  };

  const handleRejectRide = () => {
    if (incomingRequest) {
      socketClient.rejectRide(incomingRequest.requestId);
      setIncomingRequest(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast Notifications */}
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
      
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Driver Dashboard</h1>
            <button 
              onClick={() => window.location.href = '/me'}
              className="p-2 rounded-full hover:bg-gray-100 transition"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Status Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Status</h2>
              <p className="text-sm text-gray-500">
                {socketConnected ? 'Connected' : 'Disconnected'}
              </p>
            </div>
            <button
              onClick={toggleOnlineStatus}
              className={`px-6 py-3 rounded-xl font-semibold transition ${
                isOnline
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {isOnline ? 'Go Offline' : 'Go Online'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm text-gray-600 mb-1">Status</p>
              <p className={`text-lg font-bold ${isOnline ? 'text-green-600' : 'text-gray-400'}`}>
                {isOnline ? 'Online' : 'Offline'}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm text-gray-600 mb-1">Availability</p>
              <p className={`text-lg font-bold ${isAvailable ? 'text-green-600' : 'text-gray-400'}`}>
                {isAvailable ? 'Available' : 'Unavailable'}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Card */}
        {driverProfile && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Your Stats</h2>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-indigo-600">{driverProfile.totalRides || 0}</p>
                <p className="text-sm text-gray-600">Total Rides</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-indigo-600">{driverProfile.averageRating?.toFixed(1) || '0.0'}</p>
                <p className="text-sm text-gray-600">Rating</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-indigo-600">{driverProfile.completedRides || 0}</p>
                <p className="text-sm text-gray-600">Completed</p>
              </div>
            </div>

            {/* Vehicle Info */}
            {driverProfile.vehicle && (
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Vehicle Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Type</p>
                    <p className="text-sm font-semibold text-gray-900">{driverProfile.vehicle.type}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Model</p>
                    <p className="text-sm font-semibold text-gray-900">{driverProfile.vehicle.model}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Color</p>
                    <p className="text-sm font-semibold text-gray-900">{driverProfile.vehicle.color}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">License Plate</p>
                    <p className="text-sm font-semibold text-gray-900">{driverProfile.vehicle.licensePlate}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Waiting for requests */}
        {isOnline && !incomingRequest && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <svg className="w-10 h-10 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Waiting for Ride Requests</h3>
            <p className="text-gray-600">You'll be notified when a rider requests a ride nearby</p>
          </div>
        )}

        {/* Offline message */}
        {!isOnline && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">You're Offline</h3>
            <p className="text-gray-600">Go online to start receiving ride requests</p>
          </div>
        )}
      </div>

      {/* Incoming Ride Request Modal */}
      {incomingRequest && (
        <div className="fixed inset-0 z-[2000] bg-black bg-opacity-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full animate-slideUp">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">New Ride Request</h3>
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                <span className="text-2xl font-bold text-red-600">{requestTimer}s</span>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-600 mb-1">Pickup</p>
                <p className="text-sm font-medium text-gray-900">{incomingRequest.pickup.address}</p>
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-600 mb-1">Destination</p>
                <p className="text-sm font-medium text-gray-900">{incomingRequest.destination.address}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-600 mb-1">Distance</p>
                  <p className="text-lg font-bold text-gray-900">{incomingRequest.distance.toFixed(1)} km</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-600 mb-1">Fare</p>
                  <p className="text-lg font-bold text-green-600">₹{incomingRequest.fare}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleRejectRide}
                className="py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition"
              >
                Reject
              </button>
              <button
                onClick={handleAcceptRide}
                className="py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}