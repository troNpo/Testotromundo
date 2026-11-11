// ==========================================
// MAP-OVERLAYS.JS - Gestor Resiliente de Capas Complementarias (Waymarked Trails)
// ==========================================

const MapOverlays = {
    layersConfig: {
        hiking: {
            id: 'overlay-hiking-layer',
            sourceId: 'overlay-hiking-source',
            url: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',
            defaultOpacity: 0.8
        },
        cycling: {
            id: 'overlay-cycling-layer',
            sourceId: 'overlay-cycling-source',
            url: 'https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png',
            defaultOpacity: 0.8
        },
        mtb: {
            id: 'overlay-mtb-layer',
            sourceId: 'overlay-mtb-source',
            url: 'https://tile.waymarkedtrails.org/mtb/{z}/{x}/{y}.png',
            defaultOpacity: 0.8
        }
    },
    
    activeLayers: new Set(),
    
    init() {
        this.setupEvents();
        this.initWhenMapReady();
        this.bindBasemapChangeEvents();
    },
    
    getMap() {
        if (typeof window.map !== 'undefined' && window.map) return window.map;
        if (typeof window.RoutePlanner !== 'undefined' && window.RoutePlanner && window.RoutePlanner.map) {
            return window.RoutePlanner.map;
        }
        return null;
    },
    
    initWhenMapReady() {
        const mapObj = this.getMap();
        
        if (mapObj && typeof mapObj.on === 'function') {
            this.setupStyleReloadListener(mapObj);
        } else {
            // Reintentar de forma segura hasta que app-planner.js cree la instancia de MapLibre
            setTimeout(() => this.initWhenMapReady(), 100);
        }
    },
    
    setupEvents() {
        const bindLayerEvents = (key) => {
            const chk = document.getElementById(`toggle-layer-${key}`);
            const range = document.getElementById(`range-opacity-${key}`);
            
            chk?.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.activeLayers.add(key);
                    this.addLayer(key);
                } else {
                    this.activeLayers.delete(key);
                    this.removeLayer(key);
                }
            });
            
            range?.addEventListener('input', (e) => {
                this.setOpacity(key, parseFloat(e.target.value));
            });
        };
        
        ['hiking', 'cycling', 'mtb'].forEach(bindLayerEvents);
    },
    
    bindBasemapChangeEvents() {
        const basemapInputs = document.querySelectorAll('input[name="basemap"]');
        basemapInputs.forEach(input => {
            input.addEventListener('change', () => {
                setTimeout(() => this.restoreActiveLayers(), 400);
            });
        });
    },
    
    setupStyleReloadListener(mapObj) {
        if (!mapObj || typeof mapObj.on !== 'function') return;
        
        mapObj.on('idle', () => {
            this._isMapIdle = true;
        });
        
        mapObj.on('style.load', () => {
            this._isMapIdle = false;
            setTimeout(() => {
                this.restoreActiveLayers();
            }, 500);
        });
    },
    
    restoreActiveLayers() {
        const mapObj = this.getMap();
        if (!mapObj) return;
        
        this.activeLayers.forEach(key => {
            const config = this.layersConfig[key];
            if (config && typeof mapObj.getSource === 'function' && !mapObj.getSource(config.sourceId)) {
                this.addLayer(key);
            }
        });
    },
    
    addLayer(key) {
        const config = this.layersConfig[key];
        const mapObj = this.getMap();
        if (!config || !mapObj) return;
        
        try {
            if (typeof mapObj.getLayer === 'function' && mapObj.getLayer(config.id)) mapObj.removeLayer(config.id);
            if (typeof mapObj.getSource === 'function' && mapObj.getSource(config.sourceId)) mapObj.removeSource(config.sourceId);
            
            mapObj.addSource(config.sourceId, {
                type: 'raster',
                tiles: [config.url],
                tileSize: 256,
                attribution: '&copy; <a href="https://waymarkedtrails.org">Waymarked Trails</a>'
            });
            
            const rangeInput = document.getElementById(`range-opacity-${key}`);
            const currentOpacity = rangeInput ? parseFloat(rangeInput.value) : config.defaultOpacity;
            
            mapObj.addLayer({
                id: config.id,
                type: 'raster',
                source: config.sourceId,
                paint: {
                    'raster-opacity': currentOpacity
                }
            });
        } catch (err) {
            // Silencioso ante desincronización puntual de estilos
        }
    },
    
    removeLayer(key) {
        const config = this.layersConfig[key];
        const mapObj = this.getMap();
        if (!config || !mapObj) return;
        
        try {
            if (typeof mapObj.getLayer === 'function' && mapObj.getLayer(config.id)) mapObj.removeLayer(config.id);
            if (typeof mapObj.getSource === 'function' && mapObj.getSource(config.sourceId)) mapObj.removeSource(config.sourceId);
        } catch (err) {
            // Silencioso
        }
    },
    
    setOpacity(key, opacity) {
        const config = this.layersConfig[key];
        const mapObj = this.getMap();
        if (!config || !mapObj) return;
        
        try {
            if (typeof mapObj.getLayer === 'function' && mapObj.getLayer(config.id)) {
                mapObj.setPaintProperty(config.id, 'raster-opacity', opacity);
            }
        } catch (err) {
            // Silencioso
        }
    }
};

window.MapOverlays = MapOverlays;
document.addEventListener('DOMContentLoaded', () => {
    MapOverlays.init();
});