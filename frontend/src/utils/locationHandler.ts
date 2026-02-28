import { useCallback, useRef } from 'react';
import { latLngToCell } from 'h3-js';

const H3_RESOLUTION = 9;
const API_BASE_URL = 'http://localhost:3000/api';

interface LocationData {
  latitude: number;
  longitude: number;
  h3Cell: string;
  timestamp: number;
}

interface NearbyDriver {
  driver: any;
  distance: number;
  routeDistance: number | null;
  eta: number | null;
  h3Index: string;
  ringLevel: number;
  lastUpdate: string;
}

/**
 * Custom hook to handle location updates and coordinate logic
 */
export const useLocationHandler = () => {
  const previousH3CellRef = useRef<string | null>(null);
  const lastLocationUpdateRef = useRef<number>(0);

  /**
   * Convert coordinates to H3 cell
   */
  const getH3Cell = useCallback((lat: number, lng: number): string => {
    return latLngToCell(lat, lng, H3_RESOLUTION);
  }, []);

  /**
   * Save location data to localStorage
   */
  const saveToLocalStorage = useCallback((locationData: LocationData) => {
    try {
      localStorage.setItem('userLocation', JSON.stringify(locationData));
      localStorage.setItem('lastH3Cell', locationData.h3Cell);
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, []);

  /**
   * Get location data from localStorage
   */
  const getFromLocalStorage = useCallback((): LocationData | null => {
    try {
      const data = localStorage.getItem('userLocation');
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return null;
    }
  }, []);

  /**
   * Update user location in backend
   */
  const updateLocationInBackend = useCallback(async (
    latitude: number,
    longitude: number
  ): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/location`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          coordinates: [longitude, latitude]
        })
      });

      if (response.ok) {
        console.log('Location updated in backend');
        return true;
      } else {
        console.error('Failed to update location in backend');
        return false;
      }
    } catch (error) {
      console.error('Error updating location in backend:', error);
      return false;
    }
  }, []);

  /**
   * Fetch nearby drivers for rider
   */
  const fetchNearbyDrivers = useCallback(async (
    latitude: number,
    longitude: number
  ): Promise<NearbyDriver[]> => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/drivers/nearby-h3?latitude=${latitude}&longitude=${longitude}`,
        {
          credentials: 'include'
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log(`Found ${data.drivers?.length || 0} nearby drivers at ring ${data.searchRadius}`);
        return data.drivers || [];
      } else {
        console.error('Failed to fetch nearby drivers');
        return [];
      }
    } catch (error) {
      console.error('Error fetching nearby drivers:', error);
      return [];
    }
  }, []);
``
  /**
   * Main handler for location updates
   * Handles H3 cell conversion, backend updates, and driver fetching
   */
  const handleLocationUpdate = useCallback(async (
    latitude: number,
    longitude: number,
    userRole: 'rider' | 'driver' | 'both' | 'admin'
  ): Promise<{
    h3Cell: string;
    cellChanged: boolean;
    nearbyDrivers: NearbyDriver[];
    locationUpdated: boolean;
  }> => {
    // Convert coordinates to H3 cell
    const currentH3Cell = getH3Cell(latitude, longitude);
    const previousH3Cell = previousH3CellRef.current;
    const cellChanged = currentH3Cell !== previousH3Cell;

    let locationUpdated = false;
    let nearbyDrivers: NearbyDriver[] = [];

    // If cell changed, update backend
    if (cellChanged) {
      console.log('H3 cell changed, updating backend...');
      locationUpdated = await updateLocationInBackend(latitude, longitude);

      // Update reference
      previousH3CellRef.current = currentH3Cell;

      // Save to localStorage
      const locationData: LocationData = {
        latitude,
        longitude,
        h3Cell: currentH3Cell,
        timestamp: Date.now()
      };
      saveToLocalStorage(locationData);
    } else {
      console.log('H3 cell unchanged, skipping backend update');
    }

    // For riders, always fetch nearby drivers (even if cell hasn't changed)
    if (userRole === 'rider' || userRole === 'both') {
      console.log('Fetching nearby drivers for rider...');
      nearbyDrivers = await fetchNearbyDrivers(latitude, longitude);
    }

    // Update last location update timestamp
    lastLocationUpdateRef.current = Date.now();

    return {
      h3Cell: currentH3Cell,
      cellChanged,
      nearbyDrivers,
      locationUpdated
    };
  }, [getH3Cell, updateLocationInBackend, fetchNearbyDrivers, saveToLocalStorage]);

  /**
   * Initialize location from localStorage
   */
  const initializeFromStorage = useCallback((): LocationData | null => {
    const storedLocation = getFromLocalStorage();
    if (storedLocation) {
      previousH3CellRef.current = storedLocation.h3Cell;
      console.log('Initialized from localStorage:', storedLocation);
    }
    return storedLocation;
  }, [getFromLocalStorage]);

  /**
   * Clear location data
   */
  const clearLocationData = useCallback(() => {
    previousH3CellRef.current = null;
    lastLocationUpdateRef.current = 0;
    localStorage.removeItem('userLocation');
    localStorage.removeItem('lastH3Cell');
    console.log('Location data cleared');
  }, []);

  return {
    handleLocationUpdate,
    initializeFromStorage,
    clearLocationData,
    getH3Cell,
    fetchNearbyDrivers
  };
};

/**
 * Standalone function to get H3 cell (for use outside hooks)
 */
export const convertToH3Cell = (lat: number, lng: number): string => {
  return latLngToCell(lat, lng, H3_RESOLUTION);
};

/**
 * Check if two coordinates are in the same H3 cell
 */
export const isSameH3Cell = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): boolean => {
  const cell1 = convertToH3Cell(lat1, lng1);
  const cell2 = convertToH3Cell(lat2, lng2);
  return cell1 === cell2;
};