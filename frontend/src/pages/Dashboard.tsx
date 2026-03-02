import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useLocationHandler } from '../utils/locationHandler';
import { RideRequestWaiting, RideAccepted, RideRequestExpired, ToastContainer } from '../components';
import { useToast } from '../hooks/useToast';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { useSocketInit } from '../hooks/useSocketInit';

// Fix for default marker icons in React-Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom car icon for nearby drivers
const carIcon = L.divIcon({
  className: 'custom-car-icon',
  html: `
    <div style="
      background: white;
      border: 2px solid #4F46E5;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    ">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#4F46E5">
        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
      </svg>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 15);
  }, [center, map]);
  return null;
};

export default function Dashboard() {
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);
  const [destination, setDestination] = useState('');
  const [pickupAddress, setPickupAddress] = useState('Getting location...');
  const [loading, setLoading] = useState(true);
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [locationPermission, setLocationPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [destinationCoords, setDestinationCoords] = useState<[number, number] | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [routeError, setRouteError] = useState<string>('');
  const [nearbyDrivers, setNearbyDrivers] = useState<any[]>([]);
  const [rideRequestStatus, setRideRequestStatus] = useState<'idle' | 'sending' | 'waiting' | 'accepted' | 'expired'>('idle');
  const [acceptedDriver, setAcceptedDriver] = useState<any>(null);
  const MAX_DISTANCE_KM = 100; // Maximum allowed distance in kilometers

  // Use contexts and hooks
  const toast = useToast();
  const { handleLocationUpdate, initializeFromStorage } = useLocationHandler();
  const { user } = useAuth();
  const { isConnected, registerUser, onRideAccepted, onRideRequestExpired } = useSocket();
  
  // Auto-initialize socket
  useSocketInit();

  // Initialize from localStorage on mount
  useEffect(() => {
    const storedLocation = initializeFromStorage();
    if (storedLocation) {
      console.log('Restored location from storage:', storedLocation);
    }
  }, [initializeFromStorage]);

  // Setup socket listeners when connected
  useEffect(() => {
    if (isConnected) {
      onRideAccepted((data) => {
        console.log('Ride accepted by driver:', data);
        setRideRequestStatus('accepted');
        setAcceptedDriver(data);
        toast.success(`${data.driverName} accepted your ride!`);
      });
      
      onRideRequestExpired((data) => {
        console.log('Ride request expired:', data);
        setRideRequestStatus('expired');
        toast.warning('No drivers available. Please try again.');
      });
    }
  }, [isConnected, onRideAccepted, onRideRequestExpired, toast]);

  // Real-time location tracking with watchPosition
  useEffect(() => {
    if (!navigator.geolocation) return;
    
    // Only start watching if location permission is granted
    if (locationPermission !== 'granted') return;

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        // Update local state for the Map UI
        setCurrentLocation([latitude, longitude]);
        fetchAddress(latitude, longitude);
        
        // Trigger H3 + Socket + Redis logic
        const result = await handleLocationUpdate(latitude, longitude, user?.role || 'rider');
        
        setNearbyDrivers(result.nearbyDrivers);
        
        // Only show toast on cell change to avoid spam
        if (result.cellChanged && result.nearbyDrivers.length > 0) {
          toast.info(`Found ${result.nearbyDrivers.length} drivers nearby`);
        }
        
        console.log('Location updated:', {
          h3Cell: result.h3Cell,
          cellChanged: result.cellChanged,
          locationUpdated: result.locationUpdated,
          driversFound: result.nearbyDrivers.length
        });
        
        // Register user with socket if connected (only on first update)
        if (isConnected && !currentLocation) {
          registerUser('rider', [longitude, latitude]);
        }
      },
      (error) => {
        console.error('GPS Error:', error);
        toast.error('Failed to update location');
      },
      {
        enableHighAccuracy: true, // Crucial for OSRM routing accuracy
        timeout: 5000,
        maximumAge: 0 // Ensure we don't get "cached" old locations
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [locationPermission, user?.role, isConnected, handleLocationUpdate, registerUser, toast, currentLocation]);

  const errorHandler = (error: GeolocationPositionError) => {
    console.error('Error getting location:', error);
    setLocationPermission('denied');
    setCurrentLocation([28.6139, 77.2090]);
    setPickupAddress('Location access denied - Using default location');
    setLoading(false);
  };

  const getInitialLocation = async () => {
    if (!navigator.geolocation) {
      setCurrentLocation([28.6139, 77.2090]);
      setPickupAddress('Geolocation not supported - Using default location');
      setLoading(false);
      return;
    }

    const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });

    if (permission.state === 'granted') {
      setLocationPermission('granted');
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentLocation([latitude, longitude]);
          fetchAddress(latitude, longitude);
          
          // Initial location update
          const result = await handleLocationUpdate(latitude, longitude, user?.role || 'rider');
          setNearbyDrivers(result.nearbyDrivers);
          
          if (result.nearbyDrivers.length > 0) {
            toast.success(`Found ${result.nearbyDrivers.length} drivers nearby`);
          }
          
          // Register user with socket if connected
          if (isConnected) {
            registerUser('rider', [longitude, latitude]);
          }
          
          setLoading(false);
        },
        errorHandler
      );
    } else if (permission.state === 'prompt') {
      // call it only if you actually want to trigger popup
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentLocation([latitude, longitude]);
          fetchAddress(latitude, longitude);
          setLocationPermission('granted');
          
          // Initial location update
          const result = await handleLocationUpdate(latitude, longitude, user?.role || 'rider');
          setNearbyDrivers(result.nearbyDrivers);
          
          if (result.nearbyDrivers.length > 0) {
            toast.success(`Found ${result.nearbyDrivers.length} drivers nearby`);
          }
          
          // Register user with socket if connected
          if (isConnected) {
            registerUser('rider', [longitude, latitude]);
          }
          
          setLoading(false);
        },
        errorHandler
      );
    } else {
      // denied
      setLocationPermission('denied');
      setCurrentLocation([28.6139, 77.2090]);
      setPickupAddress('Location access denied - Using default location');
      setLoading(false);
    }
  };

  const requestLocation = async () => {
    // Update backend with accepted preference
    try {
      await fetch('http://localhost:3000/api/users/location-access', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ locationPreference: 'accepted', locationAccessGranted: true })
      });
    } catch (error) {
      console.error('Failed to update location preference:', error);
    }
    await getInitialLocation();
  };

  useEffect(() => {
    const checkLocationAccess = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/users/me', {
          credentials: 'include'
        });
        
        if (!response.ok) {
          setLoading(false);
          return;
        }

        const userData = await response.json();

        if (userData.locationPreference === 'accepted') {
          await getInitialLocation();
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        setLoading(false);
      }
    };

    checkLocationAccess();
  }, []);

  const fetchAddress = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await response.json();
      setPickupAddress(data.display_name || 'Unknown location');
    } catch (error) {
      setPickupAddress('Unable to fetch address');
    }
  };

  // Debounce function
  const debounce = (func: Function, delay: number) => {
    let timeoutId: number;
    return (...args: any[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay) as unknown as number;
    };
  };

  // Search for location suggestions
  const searchLocation = async (query: string) => {
    if (!query.trim() || query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSearchLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`
      );
      const data = await response.json();
      setSuggestions(data);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Error searching location:', error);
      setSuggestions([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // Debounced search with 500ms delay
  const debouncedSearch = debounce(searchLocation, 500);

  const handleDestinationChange = (value: string) => {
    setDestination(value);
    debouncedSearch(value);
  };

  const handleSuggestionClick = async (suggestion: any) => {
    setDestination(suggestion.display_name);
    setShowSuggestions(false);
    setSuggestions([]);
    setRouteError('');
    
    const destLat = parseFloat(suggestion.lat);
    const destLng = parseFloat(suggestion.lon);
    setDestinationCoords([destLat, destLng]);

    // Fetch route from OSRM
    if (currentLocation) {
      await fetchRoute(currentLocation, [destLat, destLng]);
    }
  };

  const fetchRoute = async (pickup: [number, number], destination: [number, number]) => {
    try {
      const [pickupLat, pickupLng] = pickup;
      const [destLat, destLng] = destination;

      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${pickupLng},${pickupLat};${destLng},${destLat}?overview=full&geometries=geojson`
      );
      const data = await response.json();

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distanceKm = route.distance / 1000;

        // Check if distance exceeds maximum allowed
        if (distanceKm > MAX_DISTANCE_KM) {
          setRouteError(`Distance too far (${distanceKm.toFixed(1)} km). Maximum allowed is ${MAX_DISTANCE_KM} km.`);
          setRouteCoordinates([]);
          setRouteInfo(null);
          setDestinationCoords(null);
          return;
        }

        const coordinates = route.geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]] as [number, number]);
        
        setRouteCoordinates(coordinates);
        setRouteInfo({
          distance: distanceKm,
          duration: route.duration / 60 // Convert to minutes
        });
        setRouteError('');
      } else {
        setRouteError('No route found between these locations. Please try a different destination.');
        setRouteCoordinates([]);
        setRouteInfo(null);
        setDestinationCoords(null);
      }
    } catch (error) {
      console.error('Error fetching route:', error);
      setRouteError('Failed to calculate route. Please try again.');
      setRouteCoordinates([]);
      setRouteInfo(null);
      setDestinationCoords(null);
    }
  };

  const handleBookRide = async () => {
    if (!destination.trim()) {
      toast.warning('Please enter a destination');
      return;
    }
    
    if (routeError) {
      toast.error('Cannot book ride: ' + routeError);
      return;
    }

    if (!routeInfo || !destinationCoords || !currentLocation) {
      toast.warning('Please select a destination from the suggestions');
      return;
    }

    if (nearbyDrivers.length === 0) {
      toast.error('No drivers available in your area');
      return;
    }

    setRideRequestStatus('sending');
    toast.info('Sending ride request...');

    try {
      // Calculate fare (simple calculation: ₹10 base + ₹12 per km)
      const fare = Math.round(10 + (routeInfo.distance * 12));
      
      // Get top 5 nearest drivers
      const driverIds = nearbyDrivers.slice(0, 5).map(d => d.driver._id);

      const response = await fetch('http://localhost:3000/api/rides/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          driverIds,
          pickup: {
            address: pickupAddress,
            coordinates: [currentLocation[1], currentLocation[0]] // [lng, lat]
          },
          destination: {
            address: destination,
            coordinates: [destinationCoords[1], destinationCoords[0]] // [lng, lat]
          },
          fare,
          distance: routeInfo.distance
        })
      });

      if (response.ok) {
        const data = await response.json();
        setRideRequestStatus('waiting');
        toast.success(`Request sent to ${data.sent} drivers`);
        console.log('Ride request sent:', data);
      } else {
        const error = await response.json();
        toast.error('Failed to send ride request: ' + error.message);
        setRideRequestStatus('idle');
      }
    } catch (error) {
      console.error('Error booking ride:', error);
      toast.error('Failed to book ride. Please try again.');
      setRideRequestStatus('idle');
    }
  };

  if (loading || !currentLocation) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-100">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-4 text-center space-y-6 animate-fadeIn">
          <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-10 h-10 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Enable Location Access</h2>
            <p className="text-gray-600">
              We need your location to show nearby rides and provide accurate pickup details
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
            <p className="text-sm text-blue-800">
              <span className="font-semibold">Why we need this:</span>
            </p>
            <ul className="text-sm text-blue-700 mt-2 space-y-1 list-disc list-inside">
              <li>Find your current location</li>
              <li>Show nearby available rides</li>
              <li>Calculate accurate fares</li>
            </ul>
          </div>

          {locationPermission === 'denied' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">
                Location access was denied. Please enable it in your browser settings to use this feature.
              </p>
            </div>
          )}

          <button
            onClick={requestLocation}
            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-semibold hover:bg-indigo-700 transition transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Allow Location Access
          </button>

          <button
            onClick={() => {
              setCurrentLocation([28.6139, 77.2090]);
              setPickupAddress('Default Location - New Delhi');
              setLocationPermission('denied');
              setLoading(false);
            }}
            className="w-full text-gray-600 py-3 rounded-xl font-medium hover:bg-gray-100 transition"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full relative overflow-hidden">
      {/* Toast Notifications */}
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
      
      {/* Map */}
      <MapContainer
        center={currentLocation}
        zoom={15}
        className="h-full w-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapUpdater center={currentLocation} />
        
        {/* Pickup Marker */}
        <Marker position={currentLocation}>
          <Popup>Your current location</Popup>
        </Marker>

        {/* Destination Marker */}
        {destinationCoords && (
          <Marker position={destinationCoords}>
            <Popup>Destination</Popup>
          </Marker>
        )}

        {/* Route Polyline */}
        {routeCoordinates.length > 0 && (
          <Polyline
            positions={routeCoordinates}
            color="#4F46E5"
            weight={5}
            opacity={0.7}
          />
        )}

        {/* Nearby Driver Markers */}
        {nearbyDrivers.map((driverData, index) => {
          const driver = driverData.driver;
          const coords = driver.currentLocation?.coordinates;
          
          if (!coords || coords.length !== 2) return null;
          
          // Leaflet expects [lat, lng], but MongoDB stores [lng, lat]
          const position: [number, number] = [coords[1], coords[0]];
          
          return (
            <Marker 
              key={driver._id || index} 
              position={position}
              icon={carIcon}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{driver.user?.name || 'Driver'}</p>
                  <p className="text-gray-600">{driver.vehicle?.model || 'Vehicle'}</p>
                  <p className="text-gray-600">{driver.vehicle?.type || 'Type'}</p>
                  <p className="text-indigo-600 font-medium">
                    {driverData.distance ? `${(driverData.distance / 1000).toFixed(1)} km away` : ''}
                  </p>
                  {driverData.eta && (
                    <p className="text-green-600 font-medium">{driverData.eta} min ETA</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    ⭐ {driver.averageRating?.toFixed(1) || '0.0'} ({driver.totalRides || 0} rides)
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-white shadow-md p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Book a Ride</h1>
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

      {/* Route Info Card - Google Maps Style */}
      {routeInfo && !showBottomSheet && (
        <div className="absolute top-20 left-4 right-4 z-[1000] bg-white rounded-2xl shadow-lg p-4 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{Math.round(routeInfo.duration)} min</p>
                  <p className="text-xs text-gray-500">Duration</p>
                </div>
              </div>
              <div className="h-10 w-px bg-gray-300"></div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{routeInfo.distance.toFixed(1)} km</p>
                  <p className="text-xs text-gray-500">Distance</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setDestination('');
                setDestinationCoords(null);
                setRouteCoordinates([]);
                setRouteInfo(null);
                setRouteError('');
              }}
              className="p-2 hover:bg-gray-100 rounded-full transition"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Bottom Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-[1000] bg-white rounded-t-3xl shadow-2xl transition-all duration-300 ${
          showBottomSheet ? 'h-[70%]' : 'h-auto'
        }`}
      >
        {/* Handle */}
        <div
          className="flex justify-center pt-3 pb-2 cursor-pointer"
          onClick={() => setShowBottomSheet(!showBottomSheet)}
        >
          <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
        </div>

        <div className="px-6 pb-6">
          {/* Pickup Location */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pickup Location
            </label>
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <p className="text-sm text-gray-700 flex-1 truncate">{pickupAddress}</p>
            </div>
          </div>

          {/* Destination */}
          <div className="mb-6 relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Where to?
            </label>
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border-2 border-gray-200 focus-within:border-indigo-500 transition">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <input
                type="text"
                value={destination}
                onChange={(e) => handleDestinationChange(e.target.value)}
                onFocus={() => destination.length >= 3 && setShowSuggestions(true)}
                placeholder="Enter destination"
                className="flex-1 bg-transparent outline-none text-gray-900 placeholder-gray-400"
              />
              {searchLoading && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
              )}
            </div>

            {/* Route Error */}
            {routeError && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 animate-shake">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-800">{routeError}</p>
              </div>
            )}

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-lg border border-gray-200 max-h-60 overflow-y-auto">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition"
                  >
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {suggestion.name || suggestion.display_name.split(',')[0]}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {suggestion.display_name}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ride Options */}
          {showBottomSheet && routeInfo && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <span className="text-blue-800 font-medium">{routeInfo.distance.toFixed(1)} km</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-blue-800 font-medium">{Math.round(routeInfo.duration)} min</span>
                </div>
              </div>
            </div>
          )}

          {showBottomSheet && (
            <div className="space-y-3 mb-6 animate-fadeIn">
              <div className="p-4 border-2 border-gray-200 rounded-xl hover:border-indigo-500 cursor-pointer transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                      🚗
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Mini</p>
                      <p className="text-sm text-gray-500">Affordable rides</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">₹120</p>
                    <p className="text-xs text-gray-500">2 min away</p>
                  </div>
                </div>
              </div>

              <div className="p-4 border-2 border-gray-200 rounded-xl hover:border-indigo-500 cursor-pointer transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                      🏍️
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Bike</p>
                      <p className="text-sm text-gray-500">Quick & cheap</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">₹60</p>
                    <p className="text-xs text-gray-500">1 min away</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Book Button */}
          <button
            onClick={handleBookRide}
            disabled={!!routeError || !routeInfo || rideRequestStatus !== 'idle'}
            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-semibold hover:bg-indigo-700 transition transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {rideRequestStatus === 'sending' && 'Sending Request...'}
            {rideRequestStatus === 'waiting' && 'Waiting for Driver...'}
            {rideRequestStatus === 'accepted' && 'Driver Accepted!'}
            {rideRequestStatus === 'expired' && 'Request Expired'}
            {rideRequestStatus === 'idle' && (routeError ? 'Cannot Book Ride' : 'Book Ride')}
          </button>
        </div>
      </div>

      {/* Ride Request Modals */}
      {rideRequestStatus === 'waiting' && (
        <RideRequestWaiting
          nearbyDriversCount={nearbyDrivers.slice(0, 5).length}
          onCancel={() => {
            setRideRequestStatus('idle');
          }}
        />
      )}

      {rideRequestStatus === 'accepted' && acceptedDriver && (
        <RideAccepted
          driverName={acceptedDriver.driverName}
          driverId={acceptedDriver.driverId}
          onContinue={() => {
            setRideRequestStatus('idle');
            setAcceptedDriver(null);
          }}
        />
      )}

      {rideRequestStatus === 'expired' && (
        <RideRequestExpired
          onTryAgain={() => {
            setRideRequestStatus('idle');
          }}
        />
      )}
    </div>
  );
};