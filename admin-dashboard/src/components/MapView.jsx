import { MapContainer, Polyline, Popup, TileLayer, CircleMarker, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import { colors } from '../theme/tokens';

function pointForLocation(location) {
  if (!location) return null;
  if (location._latitude !== undefined) return [location._latitude, location._longitude];
  return [location.lat, location.lng];
}

export default function MapView({ pings = [], outlets = [], visitedOutletIds = [] }) {
  const routePoints = pings.map((ping) => [ping.lat, ping.lng]);
  const center = routePoints[0] || pointForLocation(outlets[0]?.location) || [-1.286389, 36.817223];

  function FitRoute() {
    const map = useMap();
    useEffect(() => {
      map.invalidateSize();
      const points = [
        ...routePoints,
        ...outlets.map((outlet) => pointForLocation(outlet.location)).filter(Boolean),
      ];
      if (points.length > 1) map.fitBounds(points, { padding: [28, 28], maxZoom: 15 });
      else if (points.length) map.setView(points[0], 14);
    }, [map, pings, outlets]);
    return null;
  }

  return (
    <MapContainer center={center} zoom={14} style={{ height: 480, width: '100%' }}>
      <FitRoute />
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {routePoints.length > 1 && (
        <Polyline positions={routePoints} pathOptions={{ color: colors.accent, weight: 4 }} />
      )}
      {pings.length > 0 && (
        <CircleMarker
          center={routePoints[routePoints.length - 1]}
          radius={8}
          pathOptions={{ color: colors.primary, fillColor: colors.primary, fillOpacity: 1 }}
        >
          <Popup>Latest ping</Popup>
        </CircleMarker>
      )}
      {outlets.map((outlet) => {
        const position = pointForLocation(outlet.location);
        if (!position) return null;
        const visited = visitedOutletIds.includes(outlet.id);
        return (
          <CircleMarker
            key={outlet.id}
            center={position}
            radius={visited ? 7 : 6}
            pathOptions={{
              color: visited ? '#08766d' : '#a94c43',
              fillColor: visited ? '#22a985' : '#d2766d',
              fillOpacity: 0.9,
              weight: 2,
            }}
          >
            <Popup>
              <strong>{outlet.name}</strong>
              <br />
              {visited ? 'Visited' : 'Missed'}
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
