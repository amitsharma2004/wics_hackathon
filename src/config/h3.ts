import h3 from 'h3-js';

export function getCell (lat: number, lng: number) {
    const resolution = 9;
    return h3.latLngToCell (lat, lng, resolution);
};