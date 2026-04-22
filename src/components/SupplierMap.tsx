import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { MapPin, Truck, Phone, Star, Crosshair, RefreshCw, Filter, ShieldAlert, CheckCircle, Clock } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon in Leaflet + React using CDN to avoid build issues
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Internal component to handle map actions like invalidating size and fitting bounds
const MapActionController = ({ suppliers }: { suppliers: Supplier[] }) => {
  const map = useMap();
  
  useEffect(() => {
    const validSuppliers = suppliers.filter(s => s.lat !== undefined && s.lng !== undefined);
    
    // 1. Force recalculate size (Fixes gray map issue when tab is hidden initially)
    const timer = setTimeout(() => {
      map.invalidateSize();
      
      // 2. Fit bounds if there are suppliers
      if (validSuppliers.length > 0) {
        const bounds = L.latLngBounds(validSuppliers.map(s => [s.lat!, s.lng!] as [number, number]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [map, suppliers]);

  return null;
};

interface Supplier {
  id: string;
  name: string;
  rating: number;
  contact: string;
  address?: string;
  lat?: number;
  lng?: number;
  status?: 'active' | 'on-hold' | 'critical';
}

interface SupplierMapProps {
  suppliers: Supplier[];
  theme: 'dark' | 'light';
  filters: { rating: number | null, status: string | null };
  onFilterChange: (filters: { rating: number | null, status: string | null }) => void;
}

const SupplierMap: React.FC<SupplierMapProps> = ({ suppliers, theme, filters, onFilterChange }) => {
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      if (filters.rating && s.rating < filters.rating) return false;
      if (filters.status && s.status !== filters.status) return false;
      return true;
    });
  }, [suppliers, filters]);

  const validSuppliers = filteredSuppliers.filter(s => s.lat !== undefined && s.lng !== undefined);
  
  return (
    <div className={`h-[500px] w-full rounded-[32px] overflow-hidden border border-[var(--glass-border-color)] relative transition-all duration-500 shadow-2xl ${theme === 'dark' ? 'dark-map' : ''}`}>
      {/* Filtering HUD */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-wrap gap-2 pointer-events-auto">
        <div className="glass-card flex items-center gap-2 px-4 py-2 bg-[var(--panel-bg)]/90 backdrop-blur-md border border-[var(--glass-border-color)] shadow-xl">
          <Filter className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Filters:</span>
          
          <select 
            value={filters.status || ''} 
            onChange={(e) => onFilterChange({ ...filters, status: e.target.value || null })}
            className="bg-transparent text-[10px] font-bold text-[var(--text-primary)] outline-none border-none cursor-pointer hover:text-primary transition-colors ml-2"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="on-hold">On-Hold</option>
            <option value="critical">Critical</option>
          </select>

          <div className="w-px h-3 bg-[var(--glass-border-color)] mx-2" />

          <select 
            value={filters.rating || ''} 
            onChange={(e) => onFilterChange({ ...filters, rating: e.target.value ? Number(e.target.value) : null })}
            className="bg-transparent text-[10px] font-bold text-[var(--text-primary)] outline-none border-none cursor-pointer hover:text-primary transition-colors"
          >
            <option value="">All Ratings</option>
            <option value="2">2+ Stars</option>
            <option value="3">3+ Stars</option>
            <option value="4">4+ Stars</option>
            <option value="5">5 Stars</option>
          </select>

          {(filters.status || filters.rating) && (
            <button 
              onClick={() => onFilterChange({ status: null, rating: null })}
              className="ml-2 p-1 hover:bg-rose-500/10 rounded-lg text-rose-500 transition-all"
              title="Clear Filters"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <MapContainer 
        center={[20, 0]} 
        zoom={2} 
        scrollWheelZoom={true}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapActionController suppliers={validSuppliers} />
        
        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={50}
          zoomToBoundsOnClick
          spiderfyOnMaxZoom
        >
          {validSuppliers.map((supplier) => (
            <Marker 
              key={supplier.id} 
              position={[supplier.lat!, supplier.lng!]}
            >
              <Popup className="custom-popup">
                <div className="p-3 min-w-[220px] bg-[var(--panel-bg)]">
                  <div className="flex items-center justify-between mb-3 border-b border-[var(--glass-border-color)] pb-2">
                    <h4 className="font-bold text-sm text-[var(--text-primary)]">{supplier.name}</h4>
                    <div className="flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                      <span className="text-[10px] font-bold text-amber-500">{supplier.rating}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {supplier.status === 'active' ? (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                          <CheckCircle className="w-2.5 h-2.5 text-emerald-500" />
                          <span className="text-[9px] font-bold uppercase text-emerald-500">Active</span>
                        </div>
                      ) : supplier.status === 'on-hold' ? (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full">
                          <Clock className="w-2.5 h-2.5 text-amber-500" />
                          <span className="text-[9px] font-bold uppercase text-amber-500">On-Hold</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 rounded-full">
                          <ShieldAlert className="w-2.5 h-2.5 text-rose-500" />
                          <span className="text-[9px] font-bold uppercase text-rose-500">Critical</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-start gap-2 text-[10px] text-[var(--text-secondary)]">
                      <MapPin className="w-3 h-3 mt-0.5 text-primary" />
                      <span className="leading-relaxed">{supplier.address || "Global Logistics Node"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
                      <Truck className="w-3 h-3 text-primary" />
                      <span className="font-medium">Strategic Partner Hub</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
                      <Phone className="w-3 h-3 text-primary" />
                      <span>{supplier.contact}</span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
      
      {/* HUD Info Overlay */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
        <div className="glass-card p-4 bg-[var(--panel-bg)]/80 backdrop-blur-md border border-[var(--glass-border-color)] shadow-xl flex items-center gap-4">
          <div className="p-2 bg-primary/10 rounded-xl">
            <Crosshair className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-primary)]">Map Status</p>
            <p className="text-[9px] text-[var(--text-secondary)] opacity-80">{validSuppliers.length} Nodes Rendered</p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-[1000] glass-card p-4 bg-[var(--panel-bg)]/80 backdrop-blur-md border border-[var(--glass-border-color)] shadow-xl">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${validSuppliers.length > 0 ? 'bg-primary animate-pulse shadow-[0_0_8px_rgba(139,92,246,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-primary)]">
            {validSuppliers.length > 0 ? 'Neural Link Active' : 'Neural Link Restricted'}
          </span>
        </div>
      </div>

      {validSuppliers.length === 0 && filteredSuppliers.length > 0 && (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-[var(--bg-main)]/60 backdrop-blur-[2px]">
          <div className="glass-card p-10 max-w-sm text-center border-primary/20 bg-[var(--panel-bg)]/90 flex flex-col items-center shadow-2xl">
            <div className="w-16 h-16 bg-primary/10 rounded-[24px] flex items-center justify-center mb-6 border border-primary/20">
              <MapPin className="w-8 h-8 text-primary animate-bounce" />
            </div>
            <h4 className="text-lg font-bold text-[var(--text-primary)] mb-3 tracking-tight">Geographical Data Missing</h4>
            <p className="text-xs text-[var(--text-secondary)] mb-8 leading-relaxed font-medium">
              The filtered strategic partners are missing regional coordinates. Update their status to activate visualization.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierMap;
