import React, { useEffect, useState, useMemo } from 'react';
import { useLiveBuses } from '../hooks/useLiveBuses';
import DeckGL from '@deck.gl/react';
import { FlyToInterpolator } from '@deck.gl/core';
import { PathLayer, IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import Map from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';

// Initialize PMTiles so MapLibre can read the local file
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

// MapLibre style: offline vector tiles from PMTiles file
const MAP_STYLE = {
    version: 8,
    sources: {
        'hcmc-offline-data': {
            type: 'vector',
            url: `pmtiles://${window.location.origin}/tiles/hcmc.pmtiles`
        }
    },
    layers: [
        {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#F3EFE4' }
        },
        {
            id: 'water',
            type: 'fill',
            source: 'hcmc-offline-data',
            'source-layer': 'water',
            paint: { 'fill-color': '#A0D7EA' }
        },
        {
            id: 'roads-lines',
            type: 'line',
            source: 'hcmc-offline-data',
            'source-layer': 'transportation',
            filter: ['==', ['geometry-type'], 'LineString'],
            paint: {
                'line-color': [
                    'match', ['get', 'class'],
                    'primary', '#ffffff',
                    '#444444'
                ],
                'line-width': [
                    'match', ['get', 'class'],
                    'primary', 2,
                    1
                ]
            }
        },
        {
            id: 'buildings',
            type: 'fill',
            source: 'hcmc-offline-data',
            'source-layer': 'building',
            paint: { 'fill-color': '#E7E8EB', 'fill-opacity': 0.8 }
        },
        {
            id: 'poi-labels',
            type: 'symbol',
            source: 'hcmc-offline-data',
            'source-layer': 'poi',
            layout: {
                'text-field': ['get', 'name:latin'],
                'text-size': 12,
                'icon-image': ['get', 'maki'],
                'text-offset': [0, 1]
            },
            paint: {
                'text-color': '#000000',
                'text-halo-color': '#ffffff',
                'text-halo-width': 2
            }
        },
        {
            id: 'transportation-labels',
            type: 'symbol',
            source: 'hcmc-offline-data',
            'source-layer': 'transportation_name',
            layout: {
                'text-field': ['get', 'name:latin'],
                'text-font': ['Roboto Regular'],
                'symbol-placement': 'line',
                'text-size': 10
            },
            paint: {
                'text-color': '#000000',
                'text-halo-color': '#ffffff',
                'text-halo-width': 2
            }
        }
    ]
};

// Fallback camera: center of Ho Chi Minh City, District 1
const DEFAULT_VIEW_STATE = {
    longitude: 106.6983,
    latitude: 10.7715,
    zoom: 17,
    pitch: 0,
    bearing: 0,
};

const BusMap = ({
    // ── Route filtering (for future route-picker panel) ───────────────────────
    // Pass selectedRouteIds={new Set(['123','456'])} from a parent panel to
    // show only specific routes. Leave undefined to show all routes.
    selectedRouteIds: externalSelectedRouteIds,
    onRouteSelectionChange,
    targetLocation,
}) => {
    const [routes, setRoutes] = useState([]);
    const { buses, isConnected, busCount } = useLiveBuses();  // ← live polling
    const [stations, setStations] = useState([]);
    // selectedRouteIds: null = show all | Set<string> = show only those IDs
    // Controlled externally via props if a route-picker panel is connected,
    // otherwise falls back to internal state (null = all visible by default).
    const [internalSelectedRouteIds, setInternalSelectedRouteIds] = useState(null);
    const selectedRouteIds = externalSelectedRouteIds ?? internalSelectedRouteIds;
    const setSelectedRouteIds = onRouteSelectionChange ?? setInternalSelectedRouteIds;
    const [location, setLocation] = useState({ lat: null, lon: null });
    const [error, setError] = useState(null);

    // ── Controlled view state ─────────────────────────────────────────────────
    // KEY FIX: Using controlled viewState (not initialViewState).
    // initialViewState creates a new object literal every render, which caused
    // DeckGL to reset the camera whenever Home.jsx re-rendered (e.g. SettingPanel toggle).
    // With controlled viewState, the position lives in React state and is only
    // changed explicitly — external re-renders can never reset the camera.
    const [viewState, setViewState] = useState(DEFAULT_VIEW_STATE);

    const getLocation = () => {
        if (!navigator.geolocation) {
            setError('Geolocation is not supported by your browser.');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation({
                    lat: position.coords.latitude,
                    lon: position.coords.longitude,
                });
                setError(null);
            },
            (err) => {
                switch (err.code) {
                    case err.PERMISSION_DENIED:
                        setError('User denied the request for Geolocation.');
                        break;
                    case err.POSITION_UNAVAILABLE:
                        setError('Location information is unavailable.');
                        break;
                    case err.TIMEOUT:
                        setError('The request to get user location timed out.');
                        break;
                    default:
                        setError('An unknown error occurred.');
                }
            }
        );
    };

    // Request GPS once on mount
    useEffect(() => {
        getLocation();
    }, []);

    // When GPS resolves, fly the camera to the user's real position
    useEffect(() => {
        if (location.lat && location.lon) {
            setViewState(prev => ({
                ...prev,
                longitude: location.lon,
                latitude: location.lat,
            }));
        }
    }, [location]);

    // Fly to targetLocation when passed from search bar
    useEffect(() => {
        if (targetLocation && targetLocation.lat && targetLocation.lon) {
            setViewState(prev => ({
                ...prev,
                longitude: targetLocation.lon,
                latitude: targetLocation.lat,
                zoom: 17,
                transitionDuration: 1000,
                transitionInterpolator: new FlyToInterpolator()
            }));
        }
    }, [targetLocation]);

    // Load bus routes on mount
    // routes.json is an array of { id, ref, name, color, path } objects.
    // `path` is already in [lon, lat] order — no coordinate swap needed.
    useEffect(() => {
        fetch('/routes.json')
            .then(res => res.json())
            .then(data => setRoutes(data))
            .catch(err => console.error('[BusMap] Failed to load routes:', err));
    }, []);

    // Derived: only the routes the user wants to see.
    // When selectedRouteIds is null every route is visible.
    // When it's a Set, only matching IDs are rendered — filtering is instant
    // because it operates on already-loaded in-memory data (no new fetch).
    const visibleRoutes = useMemo(
        () => selectedRouteIds === null
            ? routes
            : routes.filter(r => selectedRouteIds.has(r.id)),
        [routes, selectedRouteIds]
    );

    const visibleBuses = useMemo(
        () => selectedRouteIds === null
            ? buses
            : buses.filter(b => selectedRouteIds.has(String(b.route))),
        [buses, selectedRouteIds]
    );

    // Load bus stations on mount — fetched once, stored in state
    // stations.json was pre-generated by scripts/fetch-stations.js
    // so there are zero runtime external API calls.
    useEffect(() => {
        fetch('/stations.json')
            .then(res => res.json())
            .then(data => {
                // stations.json stores { id, name, lat, lon }
                // deck.gl IconLayer expects position as [longitude, latitude]
                const formattedStations = data.map(s => ({
                    id: s.id,
                    name: s.name,
                    position: [s.lon, s.lat],
                }));
                setStations(formattedStations);
            })
            .catch(err => console.error('[BusMap] Failed to load stations:', err));
    }, []);

    // Memoize layers — DeckGL uses GPU instancing so IconLayer handles
    // thousands of bus icons in a single draw call at 60fps.
    const layers = useMemo(() => [

        // ── Static bus route lines ────────────────────────────────────────────
        // Uses `visibleRoutes` — a filtered subset (or all) of the loaded routes.
        // Each route carries its own `color` so lines are visually distinct.
        new PathLayer({
            id: 'bus-routes',
            data: visibleRoutes,
            pickable: true,
            widthScale: 5,
            widthMinPixels: 2,
            getPath: d => d.path,
            getColor: d => d.color ? [...d.color, 180] : [0, 150, 255, 180],
            getWidth: () => 1,
        }),

        // ── Live bus vehicle icons ─────────────────────────────────────────
        // `buses` is empty now; call setBuses([{ id, position:[lon,lat] }])
        // from your API/WebSocket. IconLayer renders all of them in ONE draw call.
        new IconLayer({
            id: 'bus-vehicles',
            data: visibleBuses,
            pickable: true,
            getPosition: d => d.position,
            getIcon: () => ({
                url: '/bus.svg',
                width: 128,
                height: 128,
                anchorX: 64,
                anchorY: 64,
            }),
            // Fixed pixel size — won't scale when user zooms in/out
            sizeUnits: 'pixels',
            sizeScale: 1,
            getSize: 36,
            sizeMinPixels: 36,
            sizeMaxPixels: 36,
            onClick: info => console.log('Bus clicked:', info.object),
        }),

        // ── Bus station icons ──────────────────────────────────────────────
        new IconLayer({
            id: 'bus-stations',
            data: stations,
            pickable: true,
            getPosition: d => d.position,
            getIcon: () => ({
                url: '/station.svg',
                width: 128,
                height: 128,
                anchorX: 64,
                anchorY: 64,
            }),
            // Fixed pixel size — won't scale when user zooms in/out
            sizeUnits: 'meters',
            sizeScale: 1,
            getSize: 40,
            sizeMinPixels: 2,
            sizeMaxPixels: 36,
            onClick: info => console.log('Station clicked:', info.object),
        }),

        // ── Current user location ─────────────────────────────────────────
        // ScatterplotLayer draws a pure WebGL circle — no SVG loading,
        // guaranteed visible, perfectly matches the you.svg blue dot design.
        location.lat && location.lon
            ? new ScatterplotLayer({
                id: 'user-location',
                data: [{ position: [location.lon, location.lat] }],
                getPosition: d => d.position,
                // Outer white ring
                stroked: true,
                filled: true,
                getFillColor: [83, 131, 234, 255],    // #5383EA — matches you.svg
                getLineColor: [255, 255, 255, 255],
                getLineWidth: 3,
                lineWidthUnits: 'pixels',
                // Fixed pixel radius — never scales with zoom
                radiusUnits: 'pixels',
                getRadius: 10,
                radiusMinPixels: 10,
                radiusMaxPixels: 10,
            })
            : null,

        // Filter out null so DeckGL never sees undefined layers
    ].filter(Boolean), [visibleRoutes, buses, stations, location]);

    const handleSetLocation = () => {
        if (location.lat && location.lon) {
            setViewState(prev => ({
                ...prev,
                longitude: location.lon,
                latitude: location.lat,
            }));
        }
    }

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
            <DeckGL
                viewState={viewState}
                onViewStateChange={({ viewState: vs }) => setViewState(vs)}
                controller={true}
                layers={layers}
            >
                <Map
                    attributionControl={false}
                    mapStyle={MAP_STYLE}
                />
            </DeckGL>

            {/* Set-location button */}
            <button className='absolute bottom-4 right-4 z-50 size-12 cursor-pointer' onClick={handleSetLocation}>
                <img src="/setlocation.svg" alt="" />
            </button>

            {/* Live connection status badge */}
            <div className={`absolute top-16.5 right-5 z-50 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium shadow ${isConnected ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
                <span className={`size-1.5 rounded-full ${isConnected ? 'bg-white animate-pulse' : 'bg-white'}`} />
                {isConnected ? `${busCount} buses live` : 'Offline'}
            </div>
        </div>
    );
};

export default BusMap;