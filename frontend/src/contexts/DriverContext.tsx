import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface DriverProfile {
  _id: string;
  user: {
    name: string;
    email: string;
    phoneNumber?: string;
  };
  isVerified: boolean;
  isBlocked: boolean;
  isOnline: boolean;
  isAvailable: boolean;
  licenseNumber: string;
  vehicle: {
    model: string;
    color: string;
    licensePlate: string;
    type: string;
  };
  totalRides: number;
  completedRides: number;
  cancelledRides: number;
  averageRating: number;
  totalRatings: number;
  currentLocation?: {
    type: string;
    coordinates: [number, number];
  };
}

interface DriverContextType {
  driverProfile: DriverProfile | null;
  loading: boolean;
  error: string | null;
  isDriver: boolean;
  
  // Methods
  fetchDriverProfile: () => Promise<void>;
  updateDriverStatus: (isOnline: boolean, isAvailable: boolean) => Promise<void>;
  updateDriverLocation: (coordinates: [number, number], socketId?: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const DriverContext = createContext<DriverContextType | undefined>(undefined);

export const useDriver = () => {
  const context = useContext(DriverContext);
  if (!context) {
    throw new Error('useDriver must be used within DriverProvider');
  }
  return context;
};

interface DriverProviderProps {
  children: ReactNode;
}

export const DriverProvider = ({ children }: DriverProviderProps) => {
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, isAuthenticated } = useAuth();

  const isDriver = user?.role === 'driver' || user?.role === 'both';

  // Fetch driver profile
  const fetchDriverProfile = useCallback(async () => {
    if (!isAuthenticated || !isDriver) {
      setDriverProfile(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:3000/api/drivers/me', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setDriverProfile(data);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to fetch driver profile');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch driver profile');
      console.error('Error fetching driver profile:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, isDriver]);

  // Update driver status (online/available)
  const updateDriverStatus = useCallback(async (isOnline: boolean, isAvailable: boolean) => {
    try {
      const response = await fetch('http://localhost:3000/api/drivers/status', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ isOnline, isAvailable })
      });

      if (response.ok) {
        const data = await response.json();
        setDriverProfile(prev => prev ? {
          ...prev,
          isOnline: data.isOnline,
          isAvailable: data.isAvailable
        } : null);
        return data;
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update status');
      }
    } catch (err: any) {
      console.error('Error updating driver status:', err);
      throw err;
    }
  }, []);

  // Update driver location
  const updateDriverLocation = useCallback(async (coordinates: [number, number], socketId?: string) => {
    try {
      const response = await fetch('http://localhost:3000/api/drivers/location', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          coordinates,
          socketId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update location');
      }
    } catch (err: any) {
      console.error('Error updating driver location:', err);
      throw err;
    }
  }, []);

  // Refresh profile
  const refreshProfile = useCallback(async () => {
    await fetchDriverProfile();
  }, [fetchDriverProfile]);

  // Auto-fetch profile when user becomes a driver
  useEffect(() => {
    if (isDriver) {
      fetchDriverProfile();
    } else {
      setDriverProfile(null);
    }
  }, [isDriver, fetchDriverProfile]);

  const value: DriverContextType = {
    driverProfile,
    loading,
    error,
    isDriver,
    fetchDriverProfile,
    updateDriverStatus,
    updateDriverLocation,
    refreshProfile,
  };

  return (
    <DriverContext.Provider value={value}>
      {children}
    </DriverContext.Provider>
  );
};
