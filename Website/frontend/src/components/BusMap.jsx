import React, { useEffect, useState, useMemo } from 'react';
import { useLiveBuses } from '../hooks/useLiveBuses';
import DeckGL from '@deck.gl/react';
import { FlyToInterpolator } from '@deck.gl/core';
import { PathLayer, IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import Map from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchStationDetails, fetchETA } from '../services/api';

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
            paint: { 'background-color': '#F2EFE9' }
        },
        {
            id: 'water',
            type: 'fill',
            source: 'hcmc-offline-data',
            'source-layer': 'water',
            paint: { 'fill-color': '#B3DDF2' }
        },
        {
            id: 'buildings',
            type: 'fill',
            source: 'hcmc-offline-data',
            'source-layer': 'building',
            paint: { 'fill-color': '#E5E6EB', 'fill-opacity': 1 }
        },
        {
            id: 'roads-lines',
            type: 'line',
            source: 'hcmc-offline-data',
            'source-layer': 'transportation',
            filter: ['==', ['geometry-type'], 'LineString'],
            paint: {
                'line-color': '#e0dcdcff',
                'line-width': [
                    'match', ['get', 'class'],
                    'primary', 5,
                    'secondary', 3.5,
                    'tertiary', 2.5,
                    1.5
                ]
            }
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
                'text-color': '#4A5568',
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
                'text-size': 11
            },
            paint: {
                'text-color': '#4A5568',
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
    const [internalSelectedRouteIds, setInternalSelectedRouteIds] = useState(null);
    const selectedRouteIds = externalSelectedRouteIds ?? internalSelectedRouteIds;
    const setSelectedRouteIds = onRouteSelectionChange ?? setInternalSelectedRouteIds;
    const [location, setLocation] = useState({ lat: null, lon: null });
    const [error, setError] = useState(null);

    // ── Detailed panel states ──────────────────────────────────────
    const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
    const [panelType, setPanelType] = useState(null); // 'station' | 'bus'
    const [panelData, setPanelData] = useState(null);
    const [stationDetails, setStationDetails] = useState(null);
    const [stationLoading, setStationLoading] = useState(false);
    const [busETA, setBusETA] = useState(null);
    const [busLoading, setBusLoading] = useState(false);

    const handleExpandDetails = async (type, data) => {
        setPanelType(type);
        setPanelData(data);
        setDetailsPanelOpen(true);

        if (type === 'station') {
            setStationLoading(true);
            setStationDetails(null);
            try {
                const res = await fetchStationDetails(data.id);
                setStationDetails(res);
            } catch (err) {
                console.error('[BusMap] Failed to fetch station details:', err);
            } finally {
                setStationLoading(false);
            }
        } else if (type === 'bus') {
            setBusLoading(true);
            setBusETA(null);
            try {
                // Fetch ETA for the clicked bus to reach the user's current location (or default coordinate)
                const targetLat = location.lat ?? 10.7715;
                const targetLon = location.lon ?? 106.6983;
                const res = await fetchETA(data.route, targetLat, targetLon);
                setBusETA(res);
            } catch (err) {
                console.error('[BusMap] Failed to fetch bus ETA:', err);
            } finally {
                setBusLoading(false);
            }
        }
    };

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

            // Auto-open station panel if ID is present
            if (targetLocation.id) {
                handleExpandDetails('station', {
                    id: targetLocation.id,
                    name: targetLocation.name,
                    position: [targetLocation.lon, targetLocation.lat]
                });
            }
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

    // Resolve selectedRouteIds (long OSM String IDs) to their actual route ref numbers/strings
    const selectedRouteRefs = useMemo(() => {
        if (selectedRouteIds === null) return null;
        const refs = new Set();
        for (const route of routes) {
            if (selectedRouteIds.has(route.id)) {
                refs.add(route.ref);
                refs.add(String(parseInt(route.ref, 10)));
            }
        }
        return refs;
    }, [routes, selectedRouteIds]);

    const visibleBuses = useMemo(
        () => selectedRouteRefs === null
            ? buses
            : buses.filter(b => selectedRouteRefs.has(String(b.route))),
        [buses, selectedRouteRefs]
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

    const handleStationClick = (info) => {
        if (!info.object) return;

        // Smooth camera fly-to centering on clicked station
        setViewState(prev => ({
            ...prev,
            longitude: info.object.position[0],
            latitude: info.object.position[1],
            zoom: 17,
            transitionDuration: 850,
            transitionInterpolator: new FlyToInterpolator()
        }));

        handleExpandDetails('station', info.object);
    };

    const handleBusClick = (info) => {
        if (!info.object) return;

        // Smooth camera fly-to centering on clicked bus
        setViewState(prev => ({
            ...prev,
            longitude: info.object.position[0],
            latitude: info.object.position[1],
            zoom: 17,
            transitionDuration: 850,
            transitionInterpolator: new FlyToInterpolator()
        }));

        handleExpandDetails('bus', info.object);
    };

    // Memoize layers — DeckGL uses GPU instancing so IconLayer handles
    // thousands of bus icons in a single draw call at 60fps.
    const layers = useMemo(() => [

        // ── Static bus route lines ────────────────────────────────────────────
        // Uses `visibleRoutes` — a filtered subset (or all) of the loaded routes.
        // Each route carries its own `color` so lines are visually distinct.
        new PathLayer({
            id: 'bus-routes',
            data: visibleRoutes,
            pickable: false,
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
            getSize: d => (detailsPanelOpen && panelType === 'bus' && panelData && d.id === panelData.id) ? 64 : 36,
            sizeMinPixels: 36,
            sizeMaxPixels: 64,
            onClick: info => handleBusClick(info),
            autoHighlight: true,
            highlightColor: [255, 255, 255, 120],
            updateTriggers: {
                getSize: [detailsPanelOpen, panelType, panelData?.id]
            }
        }),

        // ── Bus station icons (Unselected) ─────────────────────────────────
        // Scales down when zooming out to avoid map clutter
        new IconLayer({
            id: 'bus-stations',
            data: stations.filter(s => !(detailsPanelOpen && panelType === 'station' && panelData && s.id === panelData.id)),
            pickable: true,
            getPosition: d => d.position,
            getIcon: () => ({
                url: '/station.svg',
                width: 128,
                height: 128,
                anchorX: 64,
                anchorY: 64,
            }),
            sizeUnits: 'meters',
            sizeScale: 1,
            getSize: 40,
            sizeMinPixels: 2,
            sizeMaxPixels: 36,
            onClick: info => handleStationClick(info),
            autoHighlight: true,
            highlightColor: [83, 131, 234, 120],
        }),

        // ── Bus station icon (Selected) ────────────────────────────────────
        // Fixed pixel size so it stays large on screen regardless of zoom
        new IconLayer({
            id: 'bus-stations-selected',
            data: stations.filter(s => detailsPanelOpen && panelType === 'station' && panelData && s.id === panelData.id),
            pickable: true,
            getPosition: d => d.position,
            getIcon: () => ({
                url: '/station.svg',
                width: 128,
                height: 128,
                anchorX: 64,
                anchorY: 64,
            }),
            sizeUnits: 'pixels',
            sizeScale: 1,
            getSize: 64,
            onClick: info => handleStationClick(info),
            autoHighlight: true,
            highlightColor: [83, 131, 234, 120],
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
    ].filter(Boolean), [visibleRoutes, visibleBuses, stations, location, detailsPanelOpen, panelData, panelType]);

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
            <style>{`
                @keyframes slideIn {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                .animate-slide-in {
                    animation: slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
            `}</style>
            <DeckGL
                viewState={viewState}
                onViewStateChange={({ viewState: vs }) => setViewState(vs)}
                controller={true}
                layers={layers}
                getCursor={({ isHovering }) => isHovering ? 'pointer' : 'default'}
            >
                <Map
                    attributionControl={false}
                    mapStyle={MAP_STYLE}
                >

                </Map>
            </DeckGL>

            {/* Detailed slide-out panel on the right */}
            {detailsPanelOpen && panelData && (
                <div className="absolute top-0 right-0 z-100 h-screen w-96 bg-white/90 backdrop-blur-xl border-l border-gray-200/50 shadow-2xl flex flex-col transition-all duration-300 animate-slide-in text-gray-800">
                    {/* Header */}
                    <div className="p-4 border-b border-gray-200/50 flex justify-between items-center bg-gray-50/50 shrink-0 overflow-hidden">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 shrink-0">
                                {panelType === 'station' ? (
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10M21 16V10a2 2 0 00-2-2h-3M16 16H8" /></svg>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 className="text-base font-semibold text-gray-900 tracking-tight leading-tight truncate">
                                    {panelType === 'station' ? panelData.name : `Bus #${panelData.id}`}
                                </h2>
                                <span className="text-xs text-gray-500 font-medium block truncate">
                                    {panelType === 'station' ? `Station ID: ${panelData.id}` : `Active on Route ${String(panelData.route).padStart(2, '0')}`}
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={() => setDetailsPanelOpen(false)}
                            className="p-1.5 rounded-full hover:bg-gray-200/50 text-gray-500 transition-colors shrink-0 cursor-pointer"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    {/* Content Body */}
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                        {panelType === 'station' ? (
                            <>
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0">Routes & Live ETAs</h3>
                                {stationLoading ? (
                                    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12">
                                        <div className="w-8 h-8 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
                                        <span className="text-sm font-medium text-gray-500">Querying active buses & ETAs...</span>
                                    </div>
                                ) : stationDetails && stationDetails.routes ? (
                                    <div className="flex flex-col gap-3">
                                        {stationDetails.routes.filter(r => r.nearest_bus_id).length > 0 ? (
                                            stationDetails.routes.filter(r => r.nearest_bus_id).map(r => {
                                                // Find the route info in routes state to get its color
                                                const routeInfo = routes.find(route => Number(route.ref) === Number(r.route) || String(route.id) === String(r.route));
                                                const colorString = routeInfo ? `rgb(${routeInfo.color[0]}, ${routeInfo.color[1]}, ${routeInfo.color[2]})` : 'rgb(0, 150, 255)';

                                                return (
                                                    <div
                                                        key={r.route}
                                                        className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm flex flex-col gap-2.5 transition-shadow hover:shadow-md"
                                                        style={{ borderLeftWidth: '4px', borderLeftColor: colorString }}
                                                    >
                                                        <div className="flex flex-col gap-1.5">
                                                            <div className="flex items-center gap-2 overflow-hidden">
                                                                <div className="px-2 py-0.5 rounded font-bold text-white text-xs shrink-0 w-20 text-center" style={{ backgroundColor: colorString }}>
                                                                    Route {String(r.route).padStart(2, '0')}
                                                                </div>
                                                                <span className="text-xs text-gray-600 font-semibold truncate">
                                                                    {routeInfo ? routeInfo.name : 'City Transit'}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center mt-1">
                                                                <span className="px-2 py-0.5 rounded bg-green-50 text-green-600 border border-green-100 font-bold text-xs uppercase tracking-wide">
                                                                    Bus #{r.nearest_bus_id}
                                                                </span>

                                                                {/* Traffic status badge */}
                                                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide text-white
                                                                    ${r.traffic_status === 'heavy' ? 'bg-red-500' : r.traffic_status === 'normal' ? 'bg-amber-500' : 'bg-green-500'}
                                                                `}>
                                                                    {r.traffic_status} traffic
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col gap-2">
                                                            <div className="flex justify-between items-end">
                                                                <div className="flex items-baseline gap-1">
                                                                    <span className="text-xs font-bold text-gray-800">ETA: </span>
                                                                    <div className="text-xl font-bold text-gray-800 tracking-tight leading-none">
                                                                        {r.eta_minutes !== null ? `${Math.round(r.eta_minutes)}` : '--'}
                                                                    </div>
                                                                    <span className="text-xs font-bold text-gray-800">mins</span>
                                                                </div>
                                                                <div className="flex items-baseline gap-1">
                                                                    <span className="text-xs font-bold text-gray-800">Distance: </span>
                                                                    <div className="text-xl font-bold text-gray-800 tracking-tight leading-none">
                                                                        {r.distance_to_bus_m > 1000 ? `${(r.distance_to_bus_m / 1000).toFixed(1)}` : `${Math.round(r.distance_to_bus_m)}`}
                                                                    </div>
                                                                    <span className="text-xs font-bold text-gray-800">
                                                                        {r.distance_to_bus_m > 1000 ? 'km' : 'm'}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {r.confidence && (
                                                                <div className="text-xs font-bold text-gray-800 border-t border-gray-200 pt-2">
                                                                    <span>ETA range: {Math.round(r.confidence.low_seconds / 60)} - {Math.round(r.confidence.high_seconds / 60)} mins</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="py-8 text-center text-sm text-gray-400 italic">
                                                Currently no bus going to this station.
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="p-4 text-center text-sm text-gray-500">Could not retrieve station details.</div>
                                )}
                            </>
                        ) : (
                            <>
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0">Live Vehicle Details</h3>
                                <div className="p-4 bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col gap-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-3 bg-blue-50/45 border border-blue-100/20 rounded-xl">
                                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Live Speed</span>
                                            <div className="text-xl font-bold text-gray-800 mt-0.5">{Math.round(panelData.speed)} <span className="text-xs font-bold text-gray-800">km/h</span></div>
                                        </div>
                                        <div className="p-3 bg-blue-50/45 border border-blue-100/20 rounded-xl">
                                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Heading Direction</span>
                                            <div className="text-xl font-bold text-gray-800 mt-0.5">
                                                {Math.round(panelData.heading)}° <span className="text-lg font-bold text-gray-800 mt-0.5">{["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.floor((((panelData.heading || 0) % 360 + 360) % 360) / 45 + 0.5) % 8]}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Live ML ETA to reach User */}
                                    <div className="p-3 bg-blue-50/45 border border-blue-100/20 rounded-xl">
                                        <span className="text-[10px] text-blue-500 font-bold uppercase tracking-wide">Estimated Time of Arrival (To You)</span>
                                        {busLoading ? (
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <div className="w-4 h-4 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
                                                <span className="text-xs text-blue-500 font-medium">Calculating spatial ETA...</span>
                                            </div>
                                        ) : busETA ? (
                                            <div className="mt-1 flex justify-between items-baseline">
                                                <div className="text-xl font-bold text-blue-600">{Math.round(busETA.eta_minutes)} <span className="text-xs font-bold text-blue-600">mins</span></div>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide text-white
                                                    ${busETA.traffic_status === 'heavy' ? 'bg-red-500' : busETA.traffic_status === 'normal' ? 'bg-amber-500' : 'bg-green-500'}
                                                `}>
                                                    {busETA.traffic_status} traffic
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="text-xs text-gray-400 italic mt-1">Unable to estimate. Open GPS permission.</div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

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