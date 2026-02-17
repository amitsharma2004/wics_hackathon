import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in React-Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 15);
  }, [center, map]);
  return null;
}

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
  const MAX_DISTANCE_KM = 100; // Maximum allowed distance in kilometers

  const successHandler = (position: GeolocationPosition) => {
    const { latitude, longitude } = position.coords;
    setCurrentLocation([latitude, longitude]);
    fetchAddress(latitude, longitude);
    setLocationPermission('granted');
    setLoading(false);
  };

  const errorHandler = (error: GeolocationPositionError) => {
    console.error('Error getting location:', error);
    setLocationPermission('denied');
    setCurrentLocation([28.6139, 77.2090]);
    setPickupAddress('Location access denied - Using default location');
    setLoading(false);
  };

  const getLocation = async () => {
    if (!navigator.geolocation) {
      setCurrentLocation([28.6139, 77.2090]);
      setPickupAddress('Geolocation not supported - Using default location');
      setLoading(false);
      return;
    }

    const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });

    if (permission.state === 'granted') {
      navigator.geolocation.getCurrentPosition(successHandler, errorHandler);
    } else if (permission.state === 'prompt') {
      // call it only if you actually want to trigger popup
      navigator.geolocation.getCurrentPosition(successHandler, errorHandler);
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
    await getLocation();
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
          await getLocation();
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

  const handleBookRide = () => {
    if (!destination.trim()) {
      alert('Please enter a destination');
      return;
    }
    
    if (routeError) {
      alert('Cannot book ride: ' + routeError);
      return;
    }

    if (!routeInfo) {
      alert('Please select a destination from the suggestions');
      return;
    }

    console.log('Booking ride to:', destination);
    console.log('Route info:', routeInfo);
    // TODO: Implement ride booking API call
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
            disabled={!!routeError || !routeInfo}
            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-semibold hover:bg-indigo-700 transition transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {routeError ? 'Cannot Book Ride' : 'Book Ride'}
          </button>
        </div>
      </div>
    </div>
  );
}
