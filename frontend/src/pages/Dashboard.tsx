import { useState, useEffect, useRef, useCallback } from 'react';
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

const DEFAULT_LOCATION: [number, number] = [28.6139, 77.2090];

const carIcon = L.divIcon({
  className: 'custom-car-icon',
  html: `
    <div style="background:white;border:2px solid #4F46E5;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.2);">
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
}

export default function Dashboard() {
  // Start with default location immediately — no null, no loading gate
  const [currentLocation, setCurrentLocation] = useState<[number, number]>(DEFAULT_LOCATION);
  const [destination, setDestination] = useState('');
  const [pickupAddress, setPickupAddress] = useState('Locating you...');
  const [showBottomSheet, setShowBottomSheet] = useState(false);
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

  const MAX_DISTANCE_KM = 100;
  const addressCacheRef = useRef<Map<string, { address: string; timestamp: number }>>(new Map());
  const CACHE_DURATION = 300000;
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useToast();
  const { handleLocationUpdate } = useLocationHandler();
  const { user } = useAuth();
  const { isConnected, registerUser, onRideAccepted, onRideRequestExpired } = useSocket();

  useSocketInit();

  // ─── Socket listeners ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isConnected) return;
    onRideAccepted((data) => {
      setRideRequestStatus('accepted');
      setAcceptedDriver(data);
      toast.success(`${data.driverName} accepted your ride!`);
    });
    onRideRequestExpired(() => {
      setRideRequestStatus('expired');
      toast.warning('No drivers available. Please try again.');
    });
  }, [isConnected]); // Only re-run when connection changes, not on every render

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const fetchAddress = useCallback(async (lat: number, lng: number) => {
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = addressCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setPickupAddress(cached.address);
      return;
    }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        { headers: { 'User-Agent': 'RideShareApp/1.0' } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const address = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      addressCacheRef.current.set(cacheKey, { address, timestamp: Date.now() });
      setPickupAddress(address);
    } catch {
      setPickupAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    }
  }, []);

  const fetchNearbyDrivers = async (lat: number, lng: number) => {
    try {
      const token = localStorage.getItem('accessToken');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(
        `http://localhost:3000/api/drivers/nearby-h3?latitude=${lat}&longitude=${lng}`,
        { headers, credentials: 'include' }
      );
      if (!res.ok) return;
      const data = await res.json();
      const drivers = data.drivers || [];
      setNearbyDrivers(drivers);
      
      if (drivers.length > 0) {
        toast.success(`${drivers.length} drivers nearby`);
      }
    } catch {
      // Silent fail
    }
  };

  // ─── Location init — runs once when user is available ───────────────────────
  useEffect(() => {
    if (!user) return;

    let gpsResolved = false;

    // Step 1: Stored location → instant
    const stored = localStorage.getItem('lastLocation');
    if (stored) {
      try {
        const { lat, lng } = JSON.parse(stored);
        setCurrentLocation([lat, lng]);
        fetchAddress(lat, lng);
        fetchNearbyDrivers(lat, lng);
        handleLocationUpdate(lat, lng, user.role || 'rider');
        
        if (isConnected) {
          registerUser('rider', [lng, lat]);
        }
      } catch {
        // Invalid stored location, continue
      }
    }

    // Step 2: Fire IP immediately — no waiting for GPS
    if (!stored) {
      fetch('https://ipwho.is/')
        .then(r => r.json())
        .then(d => {
          if (d.latitude && !gpsResolved) {
            // Only use IP if GPS hasn't responded yet
            setCurrentLocation([d.latitude, d.longitude]);
            fetchAddress(d.latitude, d.longitude);
            fetchNearbyDrivers(d.latitude, d.longitude);
            handleLocationUpdate(d.latitude, d.longitude, user.role || 'rider');
            
            if (isConnected) {
              registerUser('rider', [d.longitude, d.latitude]);
            }
          }
        })
        .catch(() => {
          // IP failed, GPS will handle it
        });
    }

    // Step 3: GPS fires in parallel — updates map when ready
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          gpsResolved = true; // Block IP from overwriting after this
          const { latitude, longitude } = pos.coords;
          localStorage.setItem('lastLocation', JSON.stringify({ lat: latitude, lng: longitude }));
          setCurrentLocation([latitude, longitude]);
          fetchAddress(latitude, longitude);
          fetchNearbyDrivers(latitude, longitude);
          handleLocationUpdate(latitude, longitude, user.role || 'rider');
          
          if (isConnected) {
            registerUser('rider', [longitude, latitude]);
          }
        },
        () => {
          gpsResolved = true; // GPS failed, IP already handled it
          if (!stored) {
            setCurrentLocation([28.6139, 77.2090]);
            setPickupAddress('Enable location for better experience');
          }
        },
        { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 }
      );
    }
  }, [user, isConnected]);

  // ─── Destination search ──────────────────────────────────────────────────────
  const searchLocation = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`
      );
      const data = await res.json();
      setSuggestions(data);
      setShowSuggestions(true);
    } catch {
      setSuggestions([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleDestinationChange = (value: string) => {
    setDestination(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => searchLocation(value), 500);
  };

  const handleSuggestionClick = async (suggestion: any) => {
    setDestination(suggestion.display_name);
    setShowSuggestions(false);
    setSuggestions([]);
    setRouteError('');
    const destLat = parseFloat(suggestion.lat);
    const destLng = parseFloat(suggestion.lon);
    setDestinationCoords([destLat, destLng]);
    await fetchRoute(currentLocation, [destLat, destLng]);
    
    // Refetch nearby drivers after destination is selected
    // By now, drivers should be cached in Redis from initial load
    await fetchNearbyDrivers(currentLocation[0], currentLocation[1]);
  };

  const fetchRoute = async (pickup: [number, number], dest: [number, number]) => {
    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${pickup[1]},${pickup[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson`
      );
      const data = await res.json();
      if (data.code === 'Ok' && data.routes?.length > 0) {
        const route = data.routes[0];
        const distanceKm = route.distance / 1000;
        if (distanceKm > MAX_DISTANCE_KM) {
          setRouteError(`Too far (${distanceKm.toFixed(1)} km). Max is ${MAX_DISTANCE_KM} km.`);
          setRouteCoordinates([]);
          setRouteInfo(null);
          setDestinationCoords(null);
          return;
        }
        setRouteCoordinates(route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]));
        setRouteInfo({ distance: distanceKm, duration: route.duration / 60 });
        setRouteError('');
      } else {
        setRouteError('No route found. Try a different destination.');
        setRouteCoordinates([]);
        setRouteInfo(null);
        setDestinationCoords(null);
      }
    } catch {
      setRouteError('Failed to calculate route. Please try again.');
      setRouteCoordinates([]);
      setRouteInfo(null);
      setDestinationCoords(null);
    }
  };

  // ─── Book ride ───────────────────────────────────────────────────────────────
  const handleBookRide = async () => {
    if (!destination.trim()) return toast.warning('Please enter a destination');
    if (routeError) return toast.error('Cannot book: ' + routeError);
    if (!routeInfo || !destinationCoords) return toast.warning('Please select a destination from the list');
    
    // Refetch nearby drivers one more time before booking
    await fetchNearbyDrivers(currentLocation[0], currentLocation[1]);
    
    if (nearbyDrivers.length === 0) return toast.error('No drivers available in your area');

    setRideRequestStatus('sending');
    toast.info('Sending ride request...');

    try {
      const fare = Math.round(10 + routeInfo.distance * 12);
      const driverIds = nearbyDrivers.slice(0, 5).map((d) => d.driver._id);
      const token = localStorage.getItem('accessToken');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('http://localhost:3000/api/rides/request', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          driverIds,
          pickup: { address: pickupAddress, coordinates: [currentLocation[1], currentLocation[0]] },
          destination: { address: destination, coordinates: [destinationCoords[1], destinationCoords[0]] },
          fare,
          distance: routeInfo.distance,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRideRequestStatus('waiting');
        toast.success(`Request sent to ${data.sent} drivers`);
      } else {
        const err = await res.json();
        toast.error('Failed: ' + err.message);
        setRideRequestStatus('idle');
      }
    } catch {
      toast.error('Failed to book ride. Please try again.');
      setRideRequestStatus('idle');
    }
  };

  return (
    <div className="h-screen w-full relative overflow-hidden">
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />

      {/* Map — always visible immediately */}
      <MapContainer center={currentLocation} zoom={15} className="h-full w-full" zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapUpdater center={currentLocation} />

        <Marker position={currentLocation}>
          <Popup>Your location</Popup>
        </Marker>

        {destinationCoords && (
          <Marker position={destinationCoords}>
            <Popup>Destination</Popup>
          </Marker>
        )}

        {routeCoordinates.length > 0 && (
          <Polyline positions={routeCoordinates} color="#4F46E5" weight={5} opacity={0.7} />
        )}

        {nearbyDrivers.map((driverData, index) => {
          const driver = driverData.driver;
          const coords = driver.currentLocation?.coordinates;
          if (!coords || coords.length !== 2) return null;
          return (
            <Marker key={driver._id || index} position={[coords[1], coords[0]]} icon={carIcon}>
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{driver.user?.name || 'Driver'}</p>
                  <p className="text-gray-600">{driver.vehicle?.model || 'Vehicle'}</p>
                  <p className="text-indigo-600 font-medium">
                    {driverData.distance ? `${(driverData.distance / 1000).toFixed(1)} km away` : ''}
                  </p>
                  {driverData.eta && <p className="text-green-600 font-medium">{driverData.eta} min ETA</p>}
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
          <button onClick={() => (window.location.href = '/me')} className="p-2 rounded-full hover:bg-gray-100 transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Route Info Card */}
      {routeInfo && !showBottomSheet && (
        <div className="absolute top-20 left-4 right-4 z-[1000] bg-white rounded-2xl shadow-lg p-4">
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
              <div className="h-10 w-px bg-gray-300" />
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
              onClick={() => { setDestination(''); setDestinationCoords(null); setRouteCoordinates([]); setRouteInfo(null); setRouteError(''); }}
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
      <div className={`absolute bottom-0 left-0 right-0 z-[1000] bg-white rounded-t-3xl shadow-2xl transition-all duration-300 ${showBottomSheet ? 'h-[70%]' : 'h-auto'}`}>
        <div className="flex justify-center pt-3 pb-2 cursor-pointer" onClick={() => setShowBottomSheet(!showBottomSheet)}>
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        <div className="px-6 pb-6">
          {/* Pickup */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Pickup Location</label>
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
              <div className="w-3 h-3 bg-green-500 rounded-full flex-shrink-0" />
              <p className="text-sm text-gray-700 flex-1 truncate">{pickupAddress}</p>
            </div>
          </div>

          {/* Destination */}
          <div className="mb-6 relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">Where to?</label>
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border-2 border-gray-200 focus-within:border-indigo-500 transition">
              <div className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0" />
              <input
                type="text"
                value={destination}
                onChange={(e) => handleDestinationChange(e.target.value)}
                onFocus={() => destination.length >= 3 && setShowSuggestions(true)}
                placeholder="Enter destination"
                className="flex-1 bg-transparent outline-none text-gray-900 placeholder-gray-400"
              />
              {searchLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600" />}
            </div>

            {routeError && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-800">{routeError}</p>
              </div>
            )}

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-lg border border-gray-200 max-h-60 overflow-y-auto">
                {suggestions.map((suggestion, index) => (
                  <div key={index} onClick={() => handleSuggestionClick(suggestion)} className="p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {suggestion.name || suggestion.display_name.split(',')[0]}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{suggestion.display_name}</p>
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
                <span className="text-blue-800 font-medium">{routeInfo.distance.toFixed(1)} km</span>
                <span className="text-blue-800 font-medium">{Math.round(routeInfo.duration)} min</span>
              </div>
            </div>
          )}

          {showBottomSheet && (
            <div className="space-y-3 mb-6">
              {[
                { icon: '🚗', name: 'Mini', desc: 'Affordable rides', price: '₹120', eta: '2 min away', bg: 'bg-indigo-100' },
                { icon: '🏍️', name: 'Bike', desc: 'Quick & cheap', price: '₹60', eta: '1 min away', bg: 'bg-purple-100' },
              ].map((option) => (
                <div key={option.name} className="p-4 border-2 border-gray-200 rounded-xl hover:border-indigo-500 cursor-pointer transition">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 ${option.bg} rounded-lg flex items-center justify-center text-xl`}>{option.icon}</div>
                      <div>
                        <p className="font-semibold text-gray-900">{option.name}</p>
                        <p className="text-sm text-gray-500">{option.desc}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">{option.price}</p>
                      <p className="text-xs text-gray-500">{option.eta}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Book Button */}
          <button
            onClick={handleBookRide}
            disabled={!!routeError || !routeInfo || rideRequestStatus !== 'idle'}
            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-semibold hover:bg-indigo-700 transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {rideRequestStatus === 'sending' && 'Sending Request...'}
            {rideRequestStatus === 'waiting' && 'Waiting for Driver...'}
            {rideRequestStatus === 'accepted' && 'Driver Accepted!'}
            {rideRequestStatus === 'expired' && 'Request Expired'}
            {rideRequestStatus === 'idle' && (routeError ? 'Cannot Book Ride' : 'Book Ride')}
          </button>
        </div>
      </div>

      {/* Modals */}
      {rideRequestStatus === 'waiting' && (
        <RideRequestWaiting nearbyDriversCount={nearbyDrivers.slice(0, 5).length} onCancel={() => setRideRequestStatus('idle')} />
      )}
      {rideRequestStatus === 'accepted' && acceptedDriver && (
        <RideAccepted
          driverName={acceptedDriver.driverName}
          driverId={acceptedDriver.driverId}
          onContinue={() => { setRideRequestStatus('idle'); setAcceptedDriver(null); }}
        />
      )}
      {rideRequestStatus === 'expired' && (
        <RideRequestExpired onTryAgain={() => setRideRequestStatus('idle')} />
      )}
    </div>
  );
}