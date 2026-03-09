import React, { useEffect, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { PathLayer } from '@deck.gl/layers';
import Map from 'react-map-gl/maplibre';   // ← v8 requires the /maplibre subpath
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';

// 1. Initialize PMTiles so MapLibre can read the local file
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

// 2. Set the initial camera directly over Ho Chi Minh City
const INITIAL_VIEW_STATE = {
    longitude: 106.6983, // Center of District 1
    latitude: 10.7715,
    zoom: 12,
    pitch: 45, // Tilt the camera for a cool 3D effect
    bearing: 0
};

// 3. A minimal style JSON telling MapLibre to use our local file
const MAP_STYLE = {
    version: 8,
    sources: {
        'protomaps': {
            type: 'vector',
            url: `pmtiles://${window.location.origin}/tiles/hcmc.pmtiles`
        }
    },
    layers: [
        {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#222222' } // Dark mode background
        },
        {
            id: 'roads',
            type: 'line',
            source: 'protomaps',
            'source-layer': 'roads', // The name of the layer inside the PMTiles file
            paint: {
                'line-color': '#555555',
                'line-width': 1
            }
        }
    ]
};

const BusMap = () => {
    const [routes, setRoutes] = useState([]);

    // Load your 86 routes on mount
    useEffect(() => {
        fetch('/routes.json')
            .then(res => res.json())
            .then(data => {
                // Format the dictionary into an array that deck.gl expects
                const formattedRoutes = Object.keys(data).map(key => ({
                    route_id: key,
                    // deck.gl expects [longitude, latitude] — swap if your data is [lat, lon]
                    path: data[key].map(([lat, lon]) => [lon, lat])
                }));
                setRoutes(formattedRoutes);
            });
    }, []);

    // Define the Deck.gl layers
    const layers = [
        // This layer draws the 86 static routes as glowing lines
        new PathLayer({
            id: 'bus-routes',
            data: routes,
            pickable: true,
            widthScale: 20,
            widthMinPixels: 2,
            getPath: d => d.path,
            getColor: d => [0, 150, 255, 180], // Blue semi-transparent lines
            getWidth: d => 1
        })
    ];

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <DeckGL
                initialViewState={INITIAL_VIEW_STATE}
                controller={true} // Allows user to pan and zoom
                layers={layers}
            >
                {/* The Base Map (MapLibre) drawing the offline streets */}
                <Map
                    attributionControl={false}
                    mapStyle={MAP_STYLE}
                />
            </DeckGL>
        </div>
    );
}

export default BusMap