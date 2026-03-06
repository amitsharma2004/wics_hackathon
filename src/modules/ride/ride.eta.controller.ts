import { Request, Response } from 'express';
import { logger } from '../../config/logger.js';

interface AuthRequest extends Request {
  userId?: string;
}

/**
 * Calculate ETA and route between two points using OSRM
 * This endpoint acts as a proxy to avoid frontend rate limiting
 */
export const calculateETA = async (req: AuthRequest, res: Response) => {
  try {
    const { pickup, destination } = req.body;

    if (!pickup || !destination) {
      return res.status(400).json({
        message: 'Pickup and destination coordinates are required'
      });
    }

    const { latitude: pickupLat, longitude: pickupLng } = pickup;
    const { latitude: destLat, longitude: destLng } = destination;

    // Validate coordinates
    if (
      !pickupLat || !pickupLng || !destLat || !destLng ||
      Math.abs(pickupLat) > 90 || Math.abs(pickupLng) > 180 ||
      Math.abs(destLat) > 90 || Math.abs(destLng) > 180
    ) {
      return res.status(400).json({
        message: 'Invalid coordinates'
      });
    }

    // Use OSRM API (local Docker instance or public API)
    const osrmUrl = process.env.OSRM_URL || 'https://router.project-osrm.org';
    const url = `${osrmUrl}/route/v1/driving/${pickupLng},${pickupLat};${destLng},${destLat}?overview=full&geometries=geojson`;

    const response = await fetch(url);
    const data = await response.json() as any;

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const distanceKm = route.distance / 1000;
      const durationMin = route.duration / 60;

      // Check maximum distance (100km)
      const MAX_DISTANCE_KM = 100;
      if (distanceKm > MAX_DISTANCE_KM) {
        return res.status(400).json({
          message: `Distance too far (${distanceKm.toFixed(1)} km). Maximum allowed is ${MAX_DISTANCE_KM} km.`,
          distance: distanceKm,
          maxDistance: MAX_DISTANCE_KM
        });
      }

      // Convert coordinates from [lng, lat] to [lat, lng] for Leaflet
      const coordinates = route.geometry.coordinates.map(
        (coord: [number, number]) => [coord[1], coord[0]]
      );

      return res.status(200).json({
        success: true,
        distance: distanceKm,
        duration: durationMin,
        coordinates,
        fare: calculateFare(distanceKm)
      });
    } else {
      return res.status(404).json({
        message: 'No route found between these locations',
        osrmResponse: data
      });
    }
  } catch (error: any) {
    logger.error('Error calculating ETA:', error);
    return res.status(500).json({
      message: 'Failed to calculate ETA',
      error: error.message
    });
  }
};

/**
 * Calculate fare based on distance
 * Simple formula: ₹10 base + ₹12 per km
 */
const calculateFare = (distanceKm: number): number => {
  const BASE_FARE = 10;
  const PER_KM_RATE = 12;
  return Math.round(BASE_FARE + (distanceKm * PER_KM_RATE));
};

/**
 * Get geocoding results (address search)
 * Proxy to Nominatim API to avoid rate limiting
 */
export const searchAddress = async (req: AuthRequest, res: Response) => {
  try {
    const { query } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        message: 'Search query is required'
      });
    }

    if (query.length < 3) {
      return res.status(400).json({
        message: 'Query must be at least 3 characters'
      });
    }

    // Use Nominatim API
    const nominatimUrl = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
    const url = `${nominatimUrl}/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RideShareApp/1.0' // Required by Nominatim
      }
    });

    const data = await response.json();

    return res.status(200).json({
      success: true,
      results: data
    });
  } catch (error: any) {
    logger.error('Error searching address:', error);
    return res.status(500).json({
      message: 'Failed to search address',
      error: error.message
    });
  }
};

/**
 * Reverse geocoding (coordinates to address)
 * Proxy to Nominatim API to avoid rate limiting
 */
export const reverseGeocode = async (req: AuthRequest, res: Response) => {
  try {
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        message: 'Latitude and longitude are required'
      });
    }

    const lat = parseFloat(latitude as string);
    const lng = parseFloat(longitude as string);

    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({
        message: 'Invalid coordinates'
      });
    }

    // Use Nominatim API
    const nominatimUrl = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
    const url = `${nominatimUrl}/reverse?format=json&lat=${lat}&lon=${lng}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RideShareApp/1.0' // Required by Nominatim
      }
    });

    const data = await response.json() as any;

    return res.status(200).json({
      success: true,
      address: data.display_name,
      details: data
    });
  } catch (error: any) {
    logger.error('Error reverse geocoding:', error);
    return res.status(500).json({
      message: 'Failed to reverse geocode',
      error: error.message
    });
  }
};
